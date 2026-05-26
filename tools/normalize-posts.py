from __future__ import annotations

import datetime as dt
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / "source" / "_posts"


def split_front_matter(text: str) -> tuple[str, str]:
    if not text.startswith("---"):
        return "", text
    match = re.match(r"---\s*\n(.*?)\n---\s*\n?(.*)", text, re.S)
    if not match:
        return "", text
    return match.group(1), match.group(2)


def read_field(fm: str, key: str) -> str:
    match = re.search(rf"^{re.escape(key)}:\s*(.*)$", fm, re.M)
    return match.group(1).strip().strip("'\"") if match else ""


def slugify(value: str) -> str:
    value = value.strip().lower()
    replacements = {
        "hexo": "hexo",
        "fluid": "fluid",
        "github": "github",
        "pages": "pages",
    }
    for zh, en in replacements.items():
        value = value.replace(zh, en)
    value = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "article"


def list_block(values: list[str]) -> str:
    if not values:
        return "[]"
    return "\n" + "\n".join(f"  - {item}" for item in values)


def infer_tags(title: str, body: str) -> list[str]:
    source = f"{title}\n{body}".lower()
    tags = []
    mapping = [
        ("hexo", "Hexo"),
        ("fluid", "Fluid"),
        ("github", "GitHub Pages"),
        ("javascript", "JavaScript"),
        ("node", "Node.js"),
        ("python", "Python"),
        ("css", "CSS"),
        ("html", "HTML"),
        ("算法", "算法"),
        ("部署", "部署"),
    ]
    for needle, tag in mapping:
        if needle in source and tag not in tags:
            tags.append(tag)
    return tags or ["编程学习"]


def normalize(path: Path, write: bool) -> tuple[Path, Path]:
    raw = path.read_text(encoding="utf-8")
    fm, body = split_front_matter(raw)
    title = read_field(fm, "title") or path.stem
    date = read_field(fm, "date") or dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    date_only = date[:10] if re.match(r"\d{4}-\d{2}-\d{2}", date) else dt.date.today().isoformat()
    description = read_field(fm, "description") or read_field(fm, "excerpt")
    if not description:
      plain = re.sub(r"```.*?```", "", body, flags=re.S)
      plain = re.sub(r"[#>*_`\[\]()-]", "", plain)
      description = re.sub(r"\s+", " ", plain).strip()[:120] or "记录编程学习、技术实践和踩坑经验。"
    tags = infer_tags(title, body)
    category = "博客搭建" if "hexo" in title.lower() or "部署" in title else "技术笔记"

    front = "\n".join([
        "---",
        f"title: {title}",
        f"date: {date}",
        f"updated: {read_field(fm, 'updated') or date}",
        "author: ASHUWEI",
        "categories:" + list_block([category]),
        "tags:" + list_block(tags),
        f"description: {description}",
        f"excerpt: {description}",
        "cover: /img/home-banner.png",
        "index_img: /img/home-banner.png",
        "banner_img: /img/home-banner.png",
        "top: false",
        "sticky: 0",
        "---",
        "",
    ])
    normalized = front + body.lstrip()
    new_name = f"{date_only}-{slugify(title)}.md"
    new_path = path.with_name(new_name)
    if write:
        path.write_text(normalized, encoding="utf-8")
        if new_path != path:
            if new_path.exists():
                new_path = path.with_name(f"{date_only}-{slugify(title)}-{dt.datetime.now().strftime('%H%M%S')}.md")
            path.rename(new_path)
    return path, new_path


def main() -> None:
    write = "--write" in set(__import__("sys").argv[1:])
    for path in sorted(POSTS.glob("*.md")):
        old, new = normalize(path, write)
        action = "WRITE" if write else "DRY"
        print(f"{action}: {old.name} -> {new.name}")


if __name__ == "__main__":
    main()
