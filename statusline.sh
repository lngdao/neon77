#!/bin/bash
# neon77 status line for Claude Code. Reads session JSON on stdin, prints two lines.
input=$(cat)
j() { printf '%s' "$input" | jq -r "$1" 2>/dev/null; }

# palette (truecolor)
PINK=$'\e[38;2;255;42;109m'; CYAN=$'\e[38;2;5;217;232m'; YEL=$'\e[38;2;249;240;2m'
PURP=$'\e[38;2;211;0;197m'; GRN=$'\e[38;2;0;255;159m'; DIM=$'\e[38;2;107;122;153m'
RED=$'\e[38;2;255;56;100m'; TXT=$'\e[38;2;230;230;240m'; R=$'\e[0m'; B=$'\e[1m'
SEP="${PURP}▓${R}"

model=$(j '.model.display_name // .model.id // "?"')
pct=$(j '.context_window.used_percentage // 0' | cut -d. -f1); [ -z "$pct" ] && pct=0
cost=$(j '.cost.total_cost_usd // 0'); cost=$(printf '%.2f' "$cost" 2>/dev/null || echo 0.00)
dur_ms=$(j '.cost.total_duration_ms // 0' | cut -d. -f1); [ -z "$dur_ms" ] && dur_ms=0
secs=$((dur_ms/1000)); uptime=$(printf '%02d:%02d:%02d' $((secs/3600)) $((secs%3600/60)) $((secs%60)))
hit=$(j '.prompt_cache.hit_ratio // empty'); warm=$(j '.prompt_cache.warm // empty')
effort=$(j '.effort.level // empty'); fast=$(j '.fast_mode // false')
dir=$(j '.workspace.current_dir // .cwd // empty')

# context bar, 12 cells
cells=12; filled=$((pct*cells/100)); [ $filled -gt $cells ] && filled=$cells
bar=""; for ((i=0;i<cells;i++)); do if [ $i -lt $filled ]; then bar+="█"; else bar+="░"; fi; done
if [ "$pct" -ge 85 ]; then CC=$RED; warn=" ${B}${RED}COMPACT!${R}"
elif [ "$pct" -ge 80 ]; then CC=$PINK; warn=""
elif [ "$pct" -ge 50 ]; then CC=$YEL; warn=""
else CC=$CYAN; warn=""; fi

# cache
if [ -z "$hit" ]; then cache="${DIM}--${R}"
elif [ "$warm" = "true" ]; then cache="${GRN}$(printf '%.0f' "$(echo "$hit*100" | bc -l 2>/dev/null || echo 0)")%${R}"
else cache="${DIM}cold${R}"; fi

# git, cached 5s per directory
git_info=""
if [ -n "$dir" ] && [ -d "$dir" ]; then
  key=$(printf '%s' "$dir" | md5 2>/dev/null || printf '%s' "$dir" | md5sum | cut -d' ' -f1)
  cache_file="/tmp/neon77-git-$key"
  now=$(date +%s)
  if [ -f "$cache_file" ] && [ $((now - $(stat -f %m "$cache_file" 2>/dev/null || echo 0))) -lt 5 ]; then
    git_info=$(cat "$cache_file")
  else
    if git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      br=$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null)
      st=$(git -C "$dir" status --porcelain --untracked-files=no 2>/dev/null)
      staged=$(printf '%s\n' "$st" | grep -c '^[MADRC]' 2>/dev/null); mod=$(printf '%s\n' "$st" | grep -c '^.[MD]' 2>/dev/null)
      git_info="${CYAN} ${br}${R}"
      [ "${staged:-0}" -gt 0 ] && git_info+=" ${GRN}+${staged}${R}"
      [ "${mod:-0}" -gt 0 ] && git_info+=" ${YEL}~${mod}${R}"
    else
      git_info=" ${DIM}no repo${R}"
    fi
    printf '%s' "$git_info" > "$cache_file"
  fi
fi

clock=$(date +%H:%M)
fastlbl=$([ "$fast" = "true" ] && echo "${YEL}on${R}" || echo "${DIM}off${R}")
effortlbl=$([ -n "$effort" ] && echo "${PINK}${effort}${R}" || echo "${DIM}--${R}")

printf '%s %s%s%s %s CTX %s%s%s %s%%%s %s %s$%s%s %s %s%s%s %s CACHE %s %s\n' \
  "$SEP" "$B$PINK" "$model" "$R" "$SEP" "$CC" "$bar" "$R" "$pct" "$warn" "$SEP" "$GRN" "$cost" "$R" "$SEP" "$TXT" "$uptime" "$R" "$SEP" "$cache" "$SEP"
printf '%s%s %s EFFORT %s %s FAST %s %s %s%s NIGHT CITY%s %s\n' \
  "$SEP" "${git_info:- ${DIM}--${R}}" "$SEP" "$effortlbl" "$SEP" "$fastlbl" "$SEP" "$CYAN" "$clock" "$R" "$SEP"
