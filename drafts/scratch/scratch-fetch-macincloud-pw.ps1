$envFile = "D:/PRIVATE/ecodia-creds/supabase.env"
$line = Get-Content $envFile | Where-Object { $_ -match "^SUPABASE_ACCESS_TOKEN=" } | Select-Object -First 1
$pat = ($line -split "=", 2)[1].Trim()

$projectRef = "nxmtfzofemtrlezlyhcj"
$body = @{ query = "SELECT value FROM kv_store WHERE key = 'creds.macincloud' LIMIT 1;" } | ConvertTo-Json -Compress
$headers = @{
  "Authorization" = "Bearer $pat"
  "Content-Type"  = "application/json"
}
$resp = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" -Method Post -Headers $headers -Body $body
$resp | ConvertTo-Json -Depth 10
