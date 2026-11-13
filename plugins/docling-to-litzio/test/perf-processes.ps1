# Read-only load witnesses; no process is suspended or terminated.
$rows = Get-Process | Select-Object Id, ProcessName, CPU
@{ at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); rows = @($rows) } | ConvertTo-Json -Depth 3 -Compress
