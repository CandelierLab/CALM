#!/usr/bin/env bash
#
# CALM — deploy to calm.labojeanperrin.fr
#
#   Programs/Web/deploy.sh              # tests, then upload
#   Programs/Web/deploy.sh --no-tests   # upload only
#   Programs/Web/deploy.sh --dry-run    # show what would travel, change nothing
#
# The site is entirely static: the whole deployment is a copy of this
# directory. No Python runs on the server, nothing is built, and what is
# uploaded is byte for byte what was tested locally.
#
# The connection is the ``ljp-prod`` alias of ~/.ssh/config, which carries the
# host, the login and the deployment key: no password is needed. The subdomain
# is served from ~/softwares/calm on that account.

set -euo pipefail

REMOTE="${CALM_REMOTE:-ljp-prod}"
REMOTE_DIR="${CALM_REMOTE_DIR:-softwares/calm}"
URL="${CALM_URL:-https://calm.labojeanperrin.fr/}"

LOCAL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=""
RUN_TESTS=1
for argument in "$@"; do
	case "$argument" in
		--dry-run) DRY_RUN="--dry-run" ;;
		--no-tests) RUN_TESTS=0 ;;
		*) echo "argument inconnu : $argument" >&2; exit 2 ;;
	esac
done

# ─── tests ───────────────────────────────────────────────────────────────
#
# The full suite runs the physics of every model in both dimensions and takes
# a few minutes. --no-tests is there for when it has just been run.

if [[ "$RUN_TESTS" == 1 ]]; then
	PYTHON="${CALM_PYTHON:-/var/www/LJP/.venv/bin/python}"
	if [[ -x "$PYTHON" ]]; then
		echo "→ suite de tests…"
		"$PYTHON" "$LOCAL/tests/run.py"
	else
		echo "⚠ $PYTHON introuvable : tests non exécutés." >&2
		echo "  (selenium vit dans l'environnement du site du LJP ; " >&2
		echo "   passez --no-tests pour assumer ce saut.)" >&2
		exit 1
	fi
fi

# ─── what travels ────────────────────────────────────────────────────────
#
# Everything except the development scaffolding. Note what is *not* excluded:
# vendor/three.min.js has to go up, since the page loads it rather than
# reaching for a CDN.

echo "→ envoi vers $REMOTE:$REMOTE_DIR …"

rsync -az --delete $DRY_RUN \
	--exclude 'tests/' \
	--exclude 'serve.py' \
	--exclude 'deploy.sh' \
	--exclude 'index_test.html' \
	--exclude 'index_probe.html' \
	--exclude 'index_smoke.html' \
	--exclude '.DS_Store' \
	--exclude '__pycache__/' \
	--itemize-changes \
	"$LOCAL/" "$REMOTE:$REMOTE_DIR/"

if [[ -n "$DRY_RUN" ]]; then
	echo "→ essai à blanc : rien n'a été modifié."
	exit 0
fi

# ─── check ───────────────────────────────────────────────────────────────
#
# A static site can only fail in a few ways, and they are all worth checking
# rather than assuming: the page must answer, and every module it imports must
# answer too — a single 404 among them leaves a blank screen with no clue.

echo "→ vérification de $URL"

status=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$URL" || echo 000)
echo "   page          $status"
[[ "$status" == "200" ]] || { echo "✗ la page ne répond pas 200" >&2; exit 1; }

failures=0
for asset in \
	js/main.js js/engine.js js/ui.js js/colormap.js \
	js/renderer2d.js js/renderer3d.js js/common.js js/i18n.js \
	js/models/index.js js/models/blind.js js/models/vicsek.js \
	js/models/topological.js js/models/nematic.js \
	js/models/aoki-reynolds-couzin.js js/models/peruani.js \
	css/calm.css vendor/three.min.js \
	img/Blind.svg img/Vicsek.svg img/Topological.svg img/Nematic.svg \
	img/Aoki-Reynolds-Couzin.svg img/Peruani.svg
do
	code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$URL$asset" || echo 000)
	if [[ "$code" != "200" ]]; then
		printf '   ✗ %-40s %s\n' "$asset" "$code"
		failures=$((failures + 1))
	fi
done

# The modules must be served as JavaScript, or the browser refuses to execute
# them and the page stays blank. Worth checking once per host.
mime=$(curl -s -o /dev/null -w '%{content_type}' -m 20 "${URL}js/main.js" || echo '?')
echo "   type de js/main.js : $mime"
case "$mime" in
	*javascript*|*ecmascript*) ;;
	*) echo "   ⚠ type MIME inattendu : les modules ES risquent d'être refusés." >&2 ;;
esac

# A draft ships with everything else and is hidden at runtime, so the public
# site then shows less than the developer sees. Worth naming, whichever model
# it is — MIPS used to be the one, and no longer is.
# `|| true` parce que grep sort en 1 quand il ne trouve rien, et que le script
# tourne sous `set -euo pipefail` : sans cela, n'avoir aucun brouillon — le cas
# normal — interrompt le déploiement juste avant sa vérification finale.
drafts=$(grep -l "draft: true" "$LOCAL"/js/models/*.js 2>/dev/null \
	| xargs -r -n1 basename | sed 's/\.js$//' | tr '\n' ' ' || true)
if [ -n "$drafts" ]; then
	echo "   note : brouillon(s) envoyé(s), masqué(s) à l'exécution : $drafts"
fi

if (( failures )); then
	echo "✗ $failures fichier(s) manquant(s)" >&2
	exit 1
fi

echo "✓ déployé : $URL"
