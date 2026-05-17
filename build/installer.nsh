!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
  Function normalizeMentorVaultInstallDir
    ${If} $INSTDIR == ""
      StrCpy $INSTDIR "D:\${APP_FILENAME}"
    ${Else}
      StrCpy $0 $INSTDIR "" -1
      ${If} $0 == "\"
        StrCpy $INSTDIR $INSTDIR -1
      ${EndIf}

      StrLen $1 "${APP_FILENAME}"
      StrCpy $0 $INSTDIR $1 -$1
      ${If} $0 != "${APP_FILENAME}"
        StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
      ${EndIf}
    ${EndIf}
  FunctionEnd

  !macro customInit
    ReadRegStr $0 HKCU "Software\${APP_GUID}" InstallLocation
    ReadRegStr $1 HKLM "Software\${APP_GUID}" InstallLocation

    ${If} $0 == ""
    ${AndIf} $1 == ""
      StrCpy $INSTDIR "D:\${APP_FILENAME}"
    ${EndIf}

    Call normalizeMentorVaultInstallDir
  !macroend
!endif
