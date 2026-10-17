#define AppName "LabSerial Setup"
#define AppVersion "0.1.2"
#define AppExeName "LabSerial.Setup.exe"
[Setup]
AppId={{D4C39022-EC70-4A9D-AEB4-FBEEFC572C5A}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=LabSerial Development
DefaultDirName={localappdata}\Programs\LabSerial Setup
DefaultGroupName=LabSerial Setup
UninstallDisplayIcon={app}\{#AppExeName}
OutputDir=dist
OutputBaseFilename=LabSerial-Setup-Windows-x64-Experimental
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
PrivilegesRequired=lowest
WizardStyle=modern
DisableProgramGroupPage=yes
SetupLogging=yes
[Files]
Source: "publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\LabSerial Setup"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\LabSerial Setup"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"
[Run]
Filename: "{app}\{#AppExeName}"; Description: "Abrir LabSerial Setup"; Flags: nowait postinstall skipifsilent
[Code]
function InitializeSetup(): Boolean;
begin
  Result := MsgBox(
    'LabSerial Setup é experimental, não instala nem assina drivers e só testa o par COM210/COM211 pré-existente.' + #13#10 + #13#10 +
    'Execução real de testes exige PC de laboratório com backup e acesso físico à recuperação.' + #13#10 + #13#10 +
    'Continuar com a instalação da interface de gerenciamento?',
    mbConfirmation, MB_YESNO) = IDYES;
end;
