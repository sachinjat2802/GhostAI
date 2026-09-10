$code = @'
using System;
using System.Runtime.InteropServices;
public class FinalGhost {
    [DllImport("user32.dll")]
    public static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);
}
'@
try {
    Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
} catch {}
[FinalGhost]::SetWindowDisplayAffinity($args[0], 17)
