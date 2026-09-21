# A throwaway window for click tests to put in front: a plain box that swallows stray keys.
#
# It used to be Notepad. On Windows 11 Notepad opens into an existing Notepad window as a tab, so a test
# could never be sure which window was its own, and the cleanup (taskkill /IM notepad.exe) killed Joshua's
# Notepad along with it. Notepad also saves every unsaved tab and brings it back, so each killed stand-in
# came back later: on 2026-09-21 one Notepad process held about twenty test windows, some with stray test
# keystrokes in them. This window is its own process, saves nothing, and is closed by its process id.
param([string]$Title = 'Aang test stand-in')
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object Windows.Forms.Form
$f.Text = $Title
$f.StartPosition = 'Manual'; $f.Location = New-Object Drawing.Point(0, 0); $f.Size = New-Object Drawing.Size(420, 300)
$f.ShowInTaskbar = $true
$box = New-Object Windows.Forms.TextBox
$box.Multiline = $true; $box.Dock = 'Fill'; $box.Text = 'Stand-in for a test. It closes by itself.'
$f.Controls.Add($box)
[void]$f.ShowDialog()
