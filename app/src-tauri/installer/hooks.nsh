; NexDB's own uninstall step: before the app is removed, ask whether to keep the NexDB folder
; (projects, databases, installed versions). Keeping it is the default. Skipped for silent
; uninstalls and for updates, which reinstall over the old version.
!macro NSIS_HOOK_PREUNINSTALL
  ClearErrors
  ${GetOptions} $CMDLINE "/UPDATE" $0
  ${If} ${Errors}
  ${AndIfNot} ${Silent}
    ExecWait '"$INSTDIR\NexDB.exe" --uninstall'
  ${EndIf}
!macroend
