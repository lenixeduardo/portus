#define AppName "SerialLab"
#define AppVersion "0.1.5"
#define AppExeName "SerialLab.exe"
[Setup]
AppId={{D4C39022-EC70-4A9D-AEB4-FBEEFC572C5A}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=LabSerial Development
DefaultDirName={localappdata}\Programs\SerialLab
DefaultGroupName=SerialLab
UninstallDisplayIcon={app}\{#AppExeName}
OutputDir=dist
OutputBaseFilename=SerialLab-Setup-v0.1.5-Windows-x64
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
PrivilegesRequired=lowest
WizardStyle=modern
DisableProgramGroupPage=yes
SetupLogging=yes
SetupIconFile=SerialLab.ico
[Files]
Source: "publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[InstallDelete]
Type: files; Name: "{autoprograms}\LabSerial Setup.lnk"
Type: files; Name: "{autodesktop}\LabSerial Setup.lnk"
[Icons]
Name: "{autoprograms}\SerialLab"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\SerialLab"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"
[Run]
Filename: "{app}\{#AppExeName}"; Description: "Abrir SerialLab"; Flags: nowait postinstall skipifsilent
