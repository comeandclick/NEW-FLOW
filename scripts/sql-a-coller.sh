#!/bin/zsh
# Met dans le presse-papiers tout le SQL Supabase en attente (messages programmés, réunions fantômes, publications des réseaux
# toutes les 5 min) avec le secret cron lu dans .env.local. Le secret n'est jamais affiché ni écrit sur le disque.
set -e
cd "${0:A:h}/.."
SECRET=$(grep '^CRON_SECRET=' .env.local | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')
[[ -n "$SECRET" ]] || { echo "CRON_SECRET absent de .env.local"; exit 1; }
{ cat supabase/2026-10-19-messages-programmes.sql; echo; sed "s|__CRON_SECRET__|$SECRET|g" supabase/2026-10-19-social-cron.sql.modele; } | pbcopy
echo "SQL copié (messages programmés, réunions fantômes, réseaux toutes les 5 min) : coller dans Supabase > SQL Editor > Run."
