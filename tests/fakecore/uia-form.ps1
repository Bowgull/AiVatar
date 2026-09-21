# A stand-in app for testing UI Automation acting: a small window whose controls and their effects are known.
# Every effect is written to the file named by $env:UIA_LOG, so a test can check what really happened.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$log = $env:UIA_LOG
$f = New-Object System.Windows.Forms.Form
$f.Text = 'Aang UIA stand-in'; $f.Width = 420; $f.Height = 420; $f.StartPosition = 'CenterScreen'

function Add-Ctl($c, $name, $x, $y, $w = 200, $h = 26) { $c.Left = $x; $c.Top = $y; $c.Width = $w; $c.Height = $h; $c.AccessibleName = $name; $f.Controls.Add($c); $c }

$name = Add-Ctl (New-Object System.Windows.Forms.TextBox) 'Name field' 10 10
$hello = Add-Ctl (New-Object System.Windows.Forms.Button) 'Say hello' 10 45; $hello.Text = 'Say hello'
# The text is logged as base64 of its UTF-8 bytes: Add-Content would flatten anything outside ANSI to "?".
$hello.Add_Click({ Add-Content -Path $log -Value ("hello:" + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($name.Text))) })
$send = Add-Ctl (New-Object System.Windows.Forms.Button) 'Send' 10 80; $send.Text = 'Send'
$send.Add_Click({ Add-Content -Path $log -Value 'SENT' })
$sub = Add-Ctl (New-Object System.Windows.Forms.CheckBox) 'Subscribe' 10 115; $sub.Text = 'Subscribe'
$sub.Add_CheckedChanged({ Add-Content -Path $log -Value ("subscribe:" + $sub.Checked) })
$secret = Add-Ctl (New-Object System.Windows.Forms.TextBox) 'Secret' 10 150; $secret.UseSystemPasswordChar = $true
$ro = Add-Ctl (New-Object System.Windows.Forms.TextBox) 'Read only field' 10 185; $ro.ReadOnly = $true; $ro.Text = 'fixed'
$grey = Add-Ctl (New-Object System.Windows.Forms.Button) 'Greyed' 10 220; $grey.Text = 'Greyed'; $grey.Enabled = $false
$dlg = Add-Ctl (New-Object System.Windows.Forms.Button) 'Open dialog' 10 255; $dlg.Text = 'Open dialog'
$dlg.Add_Click({ Add-Content -Path $log -Value 'dialog-opened'; [void][System.Windows.Forms.MessageBox]::Show('A modal dialog') })
$dup1 = Add-Ctl (New-Object System.Windows.Forms.Button) 'Twin' 220 45 100; $dup1.Text = 'Twin'
$dup2 = Add-Ctl (New-Object System.Windows.Forms.Button) 'Twin' 220 80 100; $dup2.Text = 'Twin'

Add-Content -Path $log -Value 'ready'
[void]$f.ShowDialog()
