import argparse
import json
import os
import sys
import re
import ssl
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple

def parse_args() -> argparse.Namespace:
    """Analyse les arguments de la ligne de commande."""
    parser = argparse.ArgumentParser(description="Génère et évalue des candidats de code avec Codestral et JEV.")
    parser.add_argument("--spec", required=True, help="Chemin vers le fichier SPEC.md")
    parser.add_argument("--n", type=int, default=3, help="Nombre de candidats à générer")
    parser.add_argument("--out", required=True, help="Dossier de sortie")
    parser.add_argument("--mission", default="", help="Texte de mission optionnel")
    return parser.parse_args()

def read_spec(spec_path: str) -> str:
    """Lit le contenu du fichier SPEC.md."""
    with open(spec_path, "r", encoding="utf-8") as f:
        return f.read()

def call_mistral_api(spec_content: str, temperature: float) -> str:
    """Appelle l'API Mistral pour générer un candidat."""
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        sys.exit("Erreur: MISTRAL_API_KEY non définie dans les variables d'environnement")

    url = "https://api.mistral.ai/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    data = {
        "model": "codestral-latest",
        "messages": [{"role": "user", "content": spec_content}],
        "temperature": temperature
    }

    ctx = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    req = urllib.request.Request(url, json.dumps(data).encode(), headers, method="POST")
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=300) as response:
            return json.loads(response.read().decode())["choices"][0]["message"]["content"]
    except Exception as e:
        sys.exit(f"Erreur API Mistral: {str(e)}")

def write_candidate(out_dir: str, index: int, content: str) -> None:
    """Écrit un candidat dans un fichier."""
    os.makedirs(out_dir, exist_ok=True)
    with open(f"{out_dir}/cand_{index}.md", "w", encoding="utf-8") as f:
        f.write(content)

def extract_code_blocks(content: str) -> List[Tuple[str, str]]:
    """Extrait les blocs de code du contenu."""
    blocks = []
    pattern = r"### (?:NEW FILE|FILE):\s*(.*?)\n```(?:typescript|ts|tsx|python|py)\n(.*?)```"
    for match in re.finditer(pattern, content, re.DOTALL):
        blocks.append((match.group(1), match.group(2)))
    return blocks

def validate_python(code: str) -> bool:
    """Syntax-check Python source with the current interpreter (code via stdin)."""
    try:
        result = subprocess.run(
            [sys.executable, "-c", "import sys; compile(sys.stdin.read(), 'candidate', 'exec')"],
            input=code,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.returncode == 0
    except Exception:
        return False

def validate_typescript(code: str) -> bool:
    """Vérifie la validité du TypeScript avec Node."""
    try:
        result = subprocess.run(
            ["node", "-e", f"""
            const ts = require('typescript');
            const src = `{code.replace('`', '\\`')}`;
            const diagnostics = ts.transpileModule(src, {{
                reportDiagnostics: true,
                compilerOptions: {{jsx: 'preserve'}}
            }}).diagnostics;
            if (diagnostics.length > 0) process.exit(1);
            """],
            cwd=str(Path(__file__).parent.parent),
            capture_output=True,
            text=True,
            timeout=30
        )
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        return False
    except Exception:
        return False

def check_forbidden_patterns(code: str) -> List[str]:
    """Vérifie les motifs interdits dans le code."""
    violations = []
    if re.search(r":\s*any\b|as any\b", code):
        violations.append("any explicite")
    if "console.log" in code:
        violations.append("console.log")
    if re.search(r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF]", code):
        violations.append("emoji")
    return violations

def filter_candidate(content: str) -> Tuple[bool, List[str]]:
    """Filtre un candidat selon les règles."""
    if not re.search(r"### (?:NEW FILE|FILE):", content):
        return False, ["pas de bloc de code"]

    blocks = extract_code_blocks(content)
    if not blocks:
        return False, ["blocs de code invalides"]

    violations = []
    for path, code in blocks:
        if path.endswith(".py"):
            if not validate_python(code):
                violations.append("Python invalide")
                continue
        elif not validate_typescript(code):
            violations.append("TypeScript invalide")
            continue
        block_violations = check_forbidden_patterns(code)
        if block_violations:
            violations.extend(block_violations)

    return len(violations) == 0, violations

def call_jev_bridge(candidates: List[str], mission: str) -> Optional[List[Tuple[int, float]]]:
    """Appelle le juge JEV sur le VPS."""
    script = """
import sys, json
sys.path.insert(0, "/opt/harness2")
from harness2.jev_bridge import JevSelector
data = json.loads(sys.stdin.read())
print(json.dumps(JevSelector().select_best(data["candidates"], data["mission"])))
"""
    try:
        result = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "root@46.202.131.240", f"python3 -c '{script}'"],
            input=json.dumps({"mission": mission, "candidates": candidates}).encode(),
            capture_output=True,
            timeout=600
        )
        if result.returncode != 0:
            return None
        ranked = json.loads(result.stdout.decode()).get("all_ranked", [])
        return [(int(r["candidate_index"]), float(r["jev_confidence"])) for r in ranked]
    except Exception:
        return None

def generate_report(out_dir: str, n: int, rejects: Dict[int, List[str]], rankings: Optional[List[Tuple[int, float]]]) -> None:
    """Génère le rapport final."""
    survivors = n - len(rejects)
    report = {
        "total_candidates": n,
        "survivors": survivors,
        "rejects": rejects,
        "rankings": rankings if rankings else []
    }

    with open(f"{out_dir}/report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    if survivors > 0 and rankings:
        best_idx = rankings[0][0]
        with open(f"{out_dir}/best.md", "w", encoding="utf-8") as f:
            with open(f"{out_dir}/cand_{best_idx}.md", "r", encoding="utf-8") as src:
                f.write(src.read())

    print(f"Rapport généré: {n} candidats, {survivors} survivants")
    if rejects:
        print(f"Rejets: {len(rejects)} candidats")
        for idx, reasons in rejects.items():
            print(f"  cand_{idx}: {', '.join(reasons)}")
    if rankings:
        print("Classement JEV:")
        for rank, (idx, score) in enumerate(rankings, 1):
            print(f"  {rank}. cand_{idx} (score: {score:.2f})")
    if survivors > 0:
        print(f"Meilleur candidat: {out_dir}/best.md")

def main():
    args = parse_args()
    spec_content = read_spec(args.spec)
    rejects = {}
    candidates = []

    for i in range(args.n):
        temp = [0.1, 0.3, 0.5][i % 3]
        content = call_mistral_api(spec_content, temp)
        write_candidate(args.out, i, content)

        is_valid, violations = filter_candidate(content)
        if not is_valid:
            rejects[i] = violations
        else:
            candidates.append(content)

    rankings = None
    if candidates:
        survivor_ids = [i for i in range(args.n) if i not in rejects]
        ranked = call_jev_bridge(candidates, args.mission)
        rankings = [(survivor_ids[k], s) for k, s in ranked] if ranked else None
        if not rankings:
            print("Avertissement: Échec de l'appel à JEV, classement par température")
            rankings = sorted((i, 0.1 + 0.2 * (i % 3)) for i in range(args.n) if i not in rejects)

    generate_report(args.out, args.n, rejects, rankings)
    sys.exit(0 if candidates else 2)

if __name__ == "__main__":
    main()
