#!/usr/bin/env bash
# 회의 녹음·자료 인테이크: 오디오/영상 → 녹취, 문서 → 텍스트, 이미지 → 사진 후보
#
#   bash intake_media.sh --claim <claim_dir> [--input <파일|폴더>]... \
#        [--transcript <이미 만들어둔 녹취 txt>]... [--lang ko] [--model small] [--split] [--force]
#
# --transcript 로 텍스트 녹취를 직접 주면 오디오 처리를 건너뛴다(권장 — 토큰·시간 절약).
# 오디오가 실제로 있을 때만 녹취 엔진을 요구한다.
# 엔진 우선순위: whisper.cpp(whisper-cli) → openai-whisper(whisper).
set -euo pipefail

CLAIM_DIR=""; LANG_CODE="ko"; MODEL=""; SPLIT=0; FORCE=0; INPUTS=(); TRANSCRIPTS=()
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --claim) CLAIM_DIR="$2"; shift 2 ;;
    --input) INPUTS+=("$2"); shift 2 ;;
    --transcript) TRANSCRIPTS+=("$2"); shift 2 ;;
    --lang)  LANG_CODE="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --split) SPLIT=1; shift ;;
    --force) FORCE=1; shift ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$CLAIM_DIR" ]] || { echo "--claim 필요" >&2; exit 2; }
[[ ${#INPUTS[@]} -gt 0 || ${#TRANSCRIPTS[@]} -gt 0 ]] || { echo "--input 또는 --transcript 최소 1개 필요" >&2; exit 2; }

mkdir -p "$CLAIM_DIR"/{media,transcript,materials,draft,out}
WORK="$CLAIM_DIR/.work"; mkdir -p "$WORK"

# ---------- 파일 수집 ----------
FILES=()
for inp in "${INPUTS[@]}"; do
  if [[ -d "$inp" ]]; then
    while IFS= read -r -d '' f; do FILES+=("$f"); done \
      < <(find "$inp" -type f -not -name '.*' -print0)
  elif [[ -f "$inp" ]]; then
    FILES+=("$inp")
  else
    echo "[skip] 없는 경로: $inp" >&2
  fi
done

# ---------- 녹취 엔진 선택 ----------
CPP_MODEL="${WHISPER_CPP_MODEL:-}"
if [[ -z "$CPP_MODEL" ]] && command -v whisper-cli >/dev/null; then
  for size in large-v3 large medium small base; do
    for dir in "$HOME/whisper.cpp/models" "/opt/homebrew/share/whisper-cpp" "$HOME/.cache/whisper.cpp"; do
      cand=$(ls "$dir"/ggml-"$size"*.bin 2>/dev/null | grep -v '\.en\.' | head -1 || true)
      [[ -n "$cand" ]] && { CPP_MODEL="$cand"; break 2; }
    done
  done
fi
ENGINE=""
HAS_AUDIO=0
for f in "${FILES[@]:-}"; do
  case "$(echo "${f##*.}" | tr '[:upper:]' '[:lower:]')" in
    m4a|mp3|wav|aac|flac|ogg|mp4|mov|mkv|avi|webm) HAS_AUDIO=1; break ;;
  esac
done
if [[ $HAS_AUDIO -eq 1 ]]; then
  if [[ -n "$CPP_MODEL" ]] && command -v whisper-cli >/dev/null; then
    ENGINE="cpp"
  elif command -v whisper >/dev/null; then
    ENGINE="openai"; MODEL="${MODEL:-small}"
  else
    echo "오디오 파일이 있는데 녹취 엔진이 없습니다. 둘 중 하나:" >&2
    echo "  brew install whisper-cpp  +  ggml 다국어 모델(ggml-medium.bin 등)" >&2
    echo "  pip install -U openai-whisper" >&2
    echo "  또는 녹취를 직접 만들어 --transcript <txt> 로 넘기세요." >&2
    exit 3
  fi
  command -v ffmpeg >/dev/null || { echo "ffmpeg 없음 — brew install ffmpeg" >&2; exit 3; }
  echo "[engine] $ENGINE ${CPP_MODEL:+($(basename "$CPP_MODEL"))}${MODEL:+ model=$MODEL} lang=$LANG_CODE"
fi

transcribe() {  # $1=wav  $2=출력 베이스(확장자 없음)
  local wav="$1" base="$2"
  if [[ "$ENGINE" == "cpp" ]]; then
    whisper-cli -m "$CPP_MODEL" -l "$LANG_CODE" -f "$wav" -otxt -osrt -of "$base" >/dev/null
  else
    local lang="$LANG_CODE"; [[ "$lang" == "ko" ]] && lang="Korean"
    whisper "$wav" --language "$lang" --model "$MODEL" \
      --output_format txt --output_format srt \
      --output_dir "$(dirname "$base")" >/dev/null
    local stem; stem="$(basename "${wav%.*}")"
    for ext in txt srt; do
      [[ -f "$(dirname "$base")/$stem.$ext" && "$(dirname "$base")/$stem.$ext" != "$base.$ext" ]] \
        && mv "$(dirname "$base")/$stem.$ext" "$base.$ext"
    done
  fi
}

# 직접 제공된 텍스트 녹취
N_TXT=0
for t in "${TRANSCRIPTS[@]:-}"; do
  [[ -f "$t" ]] || { echo "[skip] 없는 녹취 파일: $t" >&2; continue; }
  base="$(basename "$t")"
  cp "$t" "$CLAIM_DIR/transcript/${base%.*}.txt"
  lines=$(wc -l < "$t" | tr -d ' '); chars=$(wc -m < "$t" | tr -d ' ')
  echo "[txt]   $base → transcript/${base%.*}.txt  (${lines}줄 · ${chars}자)"
  N_TXT=$((N_TXT+1))
done

N_AUDIO=0; N_DOC=0; N_IMG=0
for f in "${FILES[@]}"; do
  name="$(basename "$f")"; stem="${name%.*}"
  ext="$(echo "${name##*.}" | tr '[:upper:]' '[:lower:]')"
  case "$ext" in
    m4a|mp3|wav|aac|flac|ogg|mp4|mov|mkv|avi|webm)
      out="$CLAIM_DIR/transcript/$stem"
      if [[ -f "$out.txt" && $FORCE -eq 0 ]]; then echo "[skip] 이미 녹취됨: $stem"; continue; fi
      echo "[audio] $name"
      [[ -e "$CLAIM_DIR/media/$name" ]] || ln -s "$(cd "$(dirname "$f")" && pwd)/$name" "$CLAIM_DIR/media/$name" 2>/dev/null || cp "$f" "$CLAIM_DIR/media/$name"
      wav="$WORK/$stem.wav"
      ffmpeg -nostdin -loglevel error -y -i "$f" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$wav"
      dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$wav" | cut -d. -f1)
      echo "        길이 $((dur/60))분 $((dur%60))초"
      if [[ $SPLIT -eq 1 && $dur -gt 3600 ]]; then
        seg="$WORK/${stem}_seg"; mkdir -p "$seg"
        ffmpeg -nostdin -loglevel error -y -i "$wav" -f segment -segment_time 1800 -c copy "$seg/%03d.wav"
        : > "$out.txt"
        for part in "$seg"/*.wav; do
          transcribe "$part" "${part%.wav}"
          cat "${part%.wav}.txt" >> "$out.txt"; echo >> "$out.txt"
        done
      else
        transcribe "$wav" "$out"
      fi
      echo "        → transcript/$stem.txt"
      N_AUDIO=$((N_AUDIO+1)) ;;
    txt|md)
      if echo "$stem" | grep -qiE '녹취|전사|transcript|stt|자막|회의록'; then
        echo "[txt]   $name → transcript/ (파일명으로 녹취 판정)"
        cp "$f" "$CLAIM_DIR/transcript/$stem.txt"; N_TXT=$((N_TXT+1))
      else
        echo "[doc]   $name"
        cp -n "$f" "$CLAIM_DIR/materials/$name" 2>/dev/null || true
        python3 "$SCRIPT_DIR/extract_text.py" --input "$f" --out "$CLAIM_DIR/materials/$stem.txt" || true
        N_DOC=$((N_DOC+1))
      fi ;;
    pdf|docx|pptx|xlsx|drawio|csv|hwp|hwpx)
      echo "[doc]   $name"
      cp -n "$f" "$CLAIM_DIR/materials/$name" 2>/dev/null || true
      python3 "$SCRIPT_DIR/extract_text.py" --input "$f" --out "$CLAIM_DIR/materials/$stem.txt" || true
      N_DOC=$((N_DOC+1)) ;;
    png|jpg|jpeg|heic|gif|webp)
      echo "[img]   $name (회의 사진 후보)"
      mkdir -p "$CLAIM_DIR/materials/photos"
      cp -n "$f" "$CLAIM_DIR/materials/photos/$name" 2>/dev/null || true
      N_IMG=$((N_IMG+1)) ;;
    *) echo "[skip]  $name (미지원 확장자 .$ext)" ;;
  esac
done

# ---------- 개인정보 스캔 ----------
HITS=$(grep -rIlE '[0-9]{6}[-[:space:]]?[1-4][0-9]{6}|[0-9]{2,3}-[0-9]{3,4}-[0-9]{4}' \
        --include='*.txt' --include='*.srt' --include='*.md' --include='*.csv' \
        "$CLAIM_DIR/transcript" "$CLAIM_DIR/materials" 2>/dev/null || true)
if [[ -n "$HITS" ]]; then
  echo
  echo "⚠️  개인정보로 보이는 패턴(주민번호/전화번호)이 아래 파일에 있습니다. 확인 후 마스킹하세요:"
  echo "$HITS" | sed 's/^/    /'
fi

echo
echo "인테이크 완료 — 오디오녹취 $N_AUDIO · 텍스트녹취 $N_TXT · 문서 $N_DOC · 이미지 $N_IMG"
echo "  transcript/  $(ls "$CLAIM_DIR/transcript" 2>/dev/null | wc -l | tr -d ' ') files"
echo "  materials/   $(ls "$CLAIM_DIR/materials" 2>/dev/null | wc -l | tr -d ' ') files"
