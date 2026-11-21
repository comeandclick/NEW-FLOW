#!/bin/zsh
# Programme le déménageur des fichiers Flow vers Cloudflare R2 chaque heure (minute 23) dans pg_cron.
# Le déménageur (/api/cron/vers-r2) ne fait rien tant que Supabase est restreint ; il se met à tourner tout seul ensuite.
# Lancer : ! ~/Developer/flow/scripts/programmer-vers-r2.sh
set -e
cd ~/Developer/flow
set -a; . ./.env.local; set +a
T=$(cat ~/.config/supabase-flow-token)
SQL="select cron.schedule('flow-vers-r2','23 * * * *', \$\$select net.http_post(url:='https://new-flow-dashboard.vercel.app/api/cron/vers-r2', headers:=jsonb_build_object('x-cron-secret','$CRON_SECRET','content-type','application/json'), body:='{}'::jsonb, timeout_milliseconds:=60000)\$\$)"
curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  https://api.supabase.com/v1/projects/uwbihxsezlbqrgdebjbr/database/query \
  -d "$(jq -n --arg q "$SQL" '{query:$q}')"
echo
echo "Tâche « flow-vers-r2 » programmée (chaque heure à :23)."
