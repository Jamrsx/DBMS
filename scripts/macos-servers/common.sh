#!/bin/bash
# Shared helpers for building NexDB's server programs on macOS.
# Every program is built for the chip of the machine it runs on (Intel or Apple Silicon),
# for macOS 12 and newer, with its libraries inside its own folder, so it runs from any
# place NexDB unpacks it to. See docs/macos-port.md (Phase 2).
set -euo pipefail

export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-12.0}"
ARCH="$(uname -m)"                                   # x86_64 or arm64
CHIP="$([ "$ARCH" = arm64 ] && echo arm64 || echo x64)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="${WORK:-$PWD/work}"                            # sources and temporary installs
OUT="${OUT:-$PWD/out}"                               # finished .tar.xz files
DEPS="$WORK/deps"                                    # static OpenSSL, PCRE2 shared by all builds
JOBS="$(sysctl -n hw.ncpu)"
mkdir -p "$WORK/src" "$OUT" "$DEPS"

export CFLAGS="-O2 -mmacosx-version-min=$MACOSX_DEPLOYMENT_TARGET"
export CXXFLAGS="$CFLAGS"
export LDFLAGS="-mmacosx-version-min=$MACOSX_DEPLOYMENT_TARGET"

OPENSSL_VERSION="${OPENSSL_VERSION:-3.5.4}"
PCRE2_VERSION="${PCRE2_VERSION:-10.46}"

log() { printf '\n==> %s\n' "$*"; }

# fetch URL [FILE]: downloads once into $WORK/src and prints the path.
fetch() {
  local url="$1" file="${2:-$WORK/src/$(basename "$1")}"
  if [ ! -s "$file" ]; then
    curl -fL --retry 3 -o "$file.part" "$url"
    mv "$file.part" "$file"
  fi
  echo "$file"
}

# unpack ARCHIVE: unpacks into $WORK/src and prints the folder it made.
unpack() {
  local archive="$1" dir
  dir="$(tar -tf "$archive" | head -1 | cut -d/ -f1)"
  rm -rf "${WORK:?}/src/$dir"
  tar -xf "$archive" -C "$WORK/src"
  echo "$WORK/src/$dir"
}

# Static OpenSSL in $DEPS (libssl.a, libcrypto.a only, so nothing links to a system copy).
deps_openssl() {
  [ -f "$DEPS/lib/libssl.a" ] && return
  log "OpenSSL $OPENSSL_VERSION"
  local src target
  src="$(unpack "$(fetch "https://github.com/openssl/openssl/releases/download/openssl-$OPENSSL_VERSION/openssl-$OPENSSL_VERSION.tar.gz")")"
  target="darwin64-$ARCH-cc"
  (cd "$src" && ./Configure "$target" no-shared no-tests --prefix="$DEPS" --libdir=lib \
    && make -j"$JOBS" && make install_sw)
}

# Static PCRE2 in $DEPS (Apache, nginx).
deps_pcre2() {
  [ -f "$DEPS/lib/libpcre2-8.a" ] && return
  log "PCRE2 $PCRE2_VERSION"
  local src
  src="$(unpack "$(fetch "https://github.com/PCRE2Project/pcre2/releases/download/pcre2-$PCRE2_VERSION/pcre2-$PCRE2_VERSION.tar.bz2")")"
  (cd "$src" && ./configure --prefix="$DEPS" --disable-shared --enable-static && make -j"$JOBS" && make install)
}

# relocate DIR BUILD_PREFIX: libraries a program loads from BUILD_PREFIX are found next to it
# instead (@rpath), so the folder works wherever NexDB puts it. Re-signs ad hoc afterwards,
# since Apple Silicon refuses to run a changed, unsigned file.
relocate() {
  local dir="$1" prefix="$2" f dep base
  while IFS= read -r f; do
    file -b "$f" | grep -q 'Mach-O' || continue
    chmod u+w "$f"
    case "$f" in
      *.dylib) install_name_tool -id "@rpath/$(basename "$f")" "$f" 2>/dev/null || true ;;
    esac
    otool -L "$f" | tail -n +2 | awk '{print $1}' | while IFS= read -r dep; do
      case "$dep" in
        "$prefix"/*|"$WORK"/*)
          base="$(basename "$dep")"
          install_name_tool -change "$dep" "@rpath/$base" "$f" 2>/dev/null || true ;;
      esac
    done
    # bin/x finds ../lib; lib/x and modules/x find ./ and ../lib.
    install_name_tool -add_rpath "@loader_path/../lib" "$f" 2>/dev/null || true
    install_name_tool -add_rpath "@loader_path" "$f" 2>/dev/null || true
    codesign -f -s - "$f" 2>/dev/null || true
  done < <(find "$dir" -type f \( -perm -u+x -o -name '*.dylib' -o -name '*.so' \))
}

# check DIR: fails when any program needs a newer macOS than the floor, or loads a library
# from outside the folder and the system (Homebrew, the build machine).
check() {
  local dir="$1" f minos bad=0
  log "Checking $(basename "$dir") for macOS $MACOSX_DEPLOYMENT_TARGET and loose libraries"
  while IFS= read -r f; do
    file -b "$f" | grep -q 'Mach-O' || continue
    minos="$(vtool -show-build "$f" 2>/dev/null | awk '/minos/ {print $2; exit}')"
    if [ -n "$minos" ] && [ "$(printf '%s\n%s\n' "$minos" "$MACOSX_DEPLOYMENT_TARGET" | sort -V | tail -1)" != "$MACOSX_DEPLOYMENT_TARGET" ]; then
      echo "::error::$f needs macOS $minos (floor is $MACOSX_DEPLOYMENT_TARGET)"; bad=1
    fi
    if otool -L "$f" | tail -n +2 | awk '{print $1}' | grep -Ev '^(/usr/lib/|/System/Library/|@rpath/|@loader_path/|@executable_path/)' ; then
      echo "::error::$f loads a library from outside its folder (listed above)"; bad=1
    fi
  done < <(find "$dir" -type f \( -perm -u+x -o -name '*.dylib' -o -name '*.so' \))
  return "$bad"
}

# package ID VERSION DIR: DIR becomes $OUT/ID-VERSION-macos-CHIP.tar.xz (one top folder)
# plus a .sha256 file beside it.
package() {
  local id="$1" version="$2" dir="$3" name="$1-$2-macos-$CHIP"
  check "$dir"
  rm -rf "${WORK:?}/pkg/$name"; mkdir -p "$WORK/pkg"
  cp -R "$dir" "$WORK/pkg/$name"
  tar -C "$WORK/pkg" -cJf "$OUT/$name.tar.xz" "$name"
  (cd "$OUT" && shasum -a 256 "$name.tar.xz" | awk '{print $1}' > "$name.tar.xz.sha256")
  log "Made $OUT/$name.tar.xz ($(du -h "$OUT/$name.tar.xz" | cut -f1))"
}
