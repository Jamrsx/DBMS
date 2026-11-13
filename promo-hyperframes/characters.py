# Cartoon characters for the NexDB ads. Every character has the same animatable parts, so the ad scripts
# can swap one for another: {pid}, -head, -eyes, -eyesW, -smile, -frown, -oh, -grin, -sweat, -armL, -armR.
# Origin = head centre. Arms hang down from the shoulders; rotate them with transformOrigin "50% 8%".

OUT = "#1b1f27"


def _faces(pid, ex, ey, er, mouth_y, w=26):
    """Shared expression layers. ex/ey = eye offset, er = eye size."""
    return f'''
    <g id="{pid}-eyes"><ellipse cx="{-ex}" cy="{ey}" rx="{er * .7}" ry="{er}" fill="{OUT}"/><ellipse cx="{ex}" cy="{ey}" rx="{er * .7}" ry="{er}" fill="{OUT}"/></g>
    <g id="{pid}-eyesW" opacity="0"><circle cx="{-ex}" cy="{ey}" r="{er * 1.7}" fill="#fff" stroke="{OUT}" stroke-width="5"/><circle cx="{ex}" cy="{ey}" r="{er * 1.7}" fill="#fff" stroke="{OUT}" stroke-width="5"/><circle cx="{-ex}" cy="{ey + 2}" r="{er * .7}" fill="{OUT}"/><circle cx="{ex}" cy="{ey + 2}" r="{er * .7}" fill="{OUT}"/></g>
    <path id="{pid}-smile" d="M{-w},{mouth_y} Q0,{mouth_y + 22} {w},{mouth_y}" fill="none" stroke="{OUT}" stroke-width="7" stroke-linecap="round"/>
    <path id="{pid}-frown" opacity="0" d="M{-w + 2},{mouth_y + 16} Q0,{mouth_y - 4} {w - 2},{mouth_y + 16}" fill="none" stroke="{OUT}" stroke-width="7" stroke-linecap="round"/>
    <ellipse id="{pid}-oh" opacity="0" cx="0" cy="{mouth_y + 10}" rx="13" ry="17" fill="#5a1f1f" stroke="{OUT}" stroke-width="6"/>
    <path id="{pid}-grin" opacity="0" d="M{-w - 10},{mouth_y - 6} Q0,{mouth_y + 44} {w + 10},{mouth_y - 6} Z" fill="#fff" stroke="{OUT}" stroke-width="6" stroke-linejoin="round"/>
    <path id="{pid}-sweat" opacity="0" d="M{ex + 58},-58 Q{ex + 76},-30 {ex + 58},-20 Q{ex + 40},-30 {ex + 58},-58 Z" fill="#8fd3ff" stroke="{OUT}" stroke-width="4"/>'''


def _arm(pid, side, sx, sy, sleeve, skin, length=150, width=44, outline=True):
    dx = -18 if side == "L" else 18
    o = f'<path d="M0,0 L{dx},{length}" stroke="{OUT}" stroke-width="{width + 14}" stroke-linecap="round"/>' if outline else ""
    hand_stroke = f'stroke="{OUT}" stroke-width="7"' if outline else ""
    return f'''<g transform="translate({sx},{sy})"><g id="{pid}-arm{side}">{o}<path d="M0,0 L{dx},{length}" stroke="{sleeve}" stroke-width="{width}" stroke-linecap="round"/><circle cx="{dx}" cy="{length + 18}" r="{width * .58}" fill="{skin}" {hand_stroke}/></g></g>'''


def bean(pid, x, y, s=1.0):
    """Tall pill head, beanie, dot eyes, thin arms. Simple and funny."""
    skin, coat, hat, band = "#f0a35e", "#2f6ae0", "#1d3f8f", "#2f6ae0"
    return f'''<g transform="translate({x},{y}) scale({s})"><g id="{pid}">
  {_arm(pid, "L", -70, 150, coat, skin, 140, 30)}
  <path d="M-92,280 Q-96,130 -46,112 L46,112 Q96,130 92,280 Z" fill="{coat}" stroke="{OUT}" stroke-width="7"/>
  <path d="M0,118 V280" stroke="#1d3f8f" stroke-width="5"/>
  {_arm(pid, "R", 70, 150, coat, skin, 140, 30)}
  <g id="{pid}-head">
    <rect x="-64" y="-110" width="128" height="230" rx="64" fill="{skin}" stroke="{OUT}" stroke-width="7"/>
    <path d="M-66,-30 Q-70,-124 0,-126 Q70,-124 66,-30 Z" fill="{hat}" stroke="{OUT}" stroke-width="7"/>
    <rect x="-72" y="-42" width="144" height="34" rx="14" fill="{band}" stroke="{OUT}" stroke-width="7"/>
    <circle cx="0" cy="-132" r="20" fill="#f4f1ea" stroke="{OUT}" stroke-width="6"/>
    <ellipse cx="-34" cy="46" rx="11" ry="7" fill="#e0704f" opacity=".5"/><ellipse cx="34" cy="46" rx="11" ry="7" fill="#e0704f" opacity=".5"/>
    {_faces(pid, 24, 18, 9, 58, 20)}
  </g>
</g></g>'''


def flat(pid, x, y, s=1.0):
    """Modern flat illustration: no outlines, swoopy hair, round glasses, hoodie."""
    skin, shade, hood, hood2, hair = "#f1c3a0", "#e2a983", "#5ccb8b", "#45b077", "#2b2036"
    faces = _faces(pid, 30, 4, 10, 44, 22).replace(f'stroke="{OUT}" stroke-width="5"', 'stroke="#2b2036" stroke-width="4"')
    return f'''<g transform="translate({x},{y}) scale({s})"><g id="{pid}">
  {_arm(pid, "L", -96, 128, hood2, skin, 118, 46, outline=False)}
  <path d="M-128,270 Q-132,128 -60,100 Q0,124 60,100 Q132,128 128,270 Z" fill="{hood}"/>
  <path d="M-60,100 Q0,150 60,100 Q0,128 -60,100 Z" fill="{hood2}"/>
  <path d="M-22,128 L-26,186 M22,128 L26,186" stroke="#f4f1ea" stroke-width="6" stroke-linecap="round"/>
  <circle cx="-26" cy="192" r="6" fill="#f4f1ea"/><circle cx="26" cy="192" r="6" fill="#f4f1ea"/>
  {_arm(pid, "R", 96, 128, hood2, skin, 118, 46, outline=False)}
  <rect x="-26" y="62" width="52" height="50" rx="16" fill="{shade}"/>
  <g id="{pid}-head">
    <ellipse cx="-74" cy="10" rx="14" ry="18" fill="{shade}"/><ellipse cx="74" cy="10" rx="14" ry="18" fill="{shade}"/>
    <ellipse cx="0" cy="0" rx="74" ry="86" fill="{skin}"/>
    <path d="M-78,6 Q-92,-92 -10,-100 Q62,-112 86,-40 Q92,-6 78,10 Q70,-40 30,-50 Q-10,-30 -50,-46 Q-64,-26 -78,6 Z" fill="{hair}"/>
    <ellipse cx="-38" cy="34" rx="12" ry="7" fill="#f08a7a" opacity=".45"/><ellipse cx="38" cy="34" rx="12" ry="7" fill="#f08a7a" opacity=".45"/>
    {faces}
    <g fill="none" stroke="#2b2036" stroke-width="5"><circle cx="-30" cy="4" r="24"/><circle cx="30" cy="4" r="24"/><path d="M-6,4 H6 M-54,0 L-72,-6 M54,0 L72,-6"/></g>
  </g>
</g></g>'''


def chibi(pid, x, y, s=1.0):
    """Big head, big shiny eyes, small body, spiky hair."""
    skin, shirt, hair = "#fbd5b8", "#8b5cf6", "#3a2b6b"
    eyes = f'''
    <g id="{pid}-eyes"><ellipse cx="-40" cy="14" rx="20" ry="27" fill="#2a1f4d"/><ellipse cx="40" cy="14" rx="20" ry="27" fill="#2a1f4d"/>
      <circle cx="-46" cy="4" r="8" fill="#fff"/><circle cx="34" cy="4" r="8" fill="#fff"/><circle cx="-34" cy="26" r="4" fill="#fff"/><circle cx="46" cy="26" r="4" fill="#fff"/></g>'''
    faces = _faces(pid, 40, 14, 12, 62, 18)
    faces = faces[faces.index(f'<g id="{pid}-eyesW"'):]  # keep our big eyes, reuse the other layers
    return f'''<g transform="translate({x},{y}) scale({s})"><g id="{pid}">
  {_arm(pid, "L", -66, 172, shirt, skin, 100, 36)}
  <path d="M-84,290 Q-88,170 -44,150 L44,150 Q88,170 84,290 Z" fill="{shirt}" stroke="{OUT}" stroke-width="7"/>
  <path d="M-30,152 L0,186 L30,152" fill="#f4f1ea" stroke="{OUT}" stroke-width="5" stroke-linejoin="round"/>
  {_arm(pid, "R", 66, 172, shirt, skin, 100, 36)}
  <g id="{pid}-head">
    <ellipse cx="0" cy="10" rx="118" ry="112" fill="{skin}" stroke="{OUT}" stroke-width="7"/>
    <path d="M-124,30 Q-140,-70 -80,-112 L-62,-150 L-30,-118 L0,-160 L28,-118 L64,-150 L76,-108 Q140,-70 124,30 Q110,-24 70,-40 L52,-10 L30,-46 L0,-14 L-28,-46 L-52,-10 L-72,-40 Q-112,-24 -124,30 Z" fill="{hair}" stroke="{OUT}" stroke-width="7" stroke-linejoin="round"/>
    <ellipse cx="-70" cy="52" rx="20" ry="11" fill="#f58aa0" opacity=".55"/><ellipse cx="70" cy="52" rx="20" ry="11" fill="#f58aa0" opacity=".55"/>
    {eyes}
    {faces}
  </g>
</g></g>'''


def current(pid, x, y, s=1.0):
    """The developer used so far (round head, blue hoodie)."""
    skin, hood, hair = "#f2c9a0", "#2f6ae0", "#2a1d14"
    return f'''<g transform="translate({x},{y}) scale({s})"><g id="{pid}">
  {_arm(pid, "L", -95, 118, hood, skin)}
  <path d="M-125,260 Q-130,112 -62,84 L62,84 Q130,112 125,260 Z" fill="{hood}" stroke="{OUT}" stroke-width="7"/>
  {_arm(pid, "R", 95, 118, hood, skin)}
  <g id="{pid}-head">
    <ellipse cx="0" cy="0" rx="80" ry="90" fill="{skin}" stroke="{OUT}" stroke-width="7"/>
    <path d="M-80,-14 Q-86,-100 0,-96 Q86,-100 80,-14 Q62,-62 4,-56 Q-52,-64 -80,-14 Z" fill="{hair}" stroke="{OUT}" stroke-width="7"/>
    {_faces(pid, 28, 2, 13, 40)}
  </g>
</g></g>'''


CHARACTERS = {"bean": bean, "flat": flat, "chibi": chibi, "current": current}
