"""Hub Design: the question of the first start. The plugin comes with the links to its style sources (Refero and nine repositories of ready sets);
downloading them is about 2 GB and a few hours, so nothing is downloaded until the owner answers: Download / Don't / I'll change it in the settings.

The same question goes to the page (a card over the plugin, main.js) and to Telegram (a post with the three buttons, tgpost.py reads the press);
the first answer from either place settles it, the other one disappears. The answer is remembered (links.py, "first"): it is not asked twice;
the settings tab can ask it again. The page draws its own text (it has the language table); this file holds the numbers and the Telegram text.

What the owner is told about the size and time is measured on a full library of the defaults (2058 styles: 1342 of Refero, 716 of the repositories;
the covers are moving previews of ~1.4 MB each and most of it)."""

REF = "hd:first"                     # the ref of the Telegram post: a press comes back signed ext:hub-design with this ref
CHOICES = ("yes", "no", "settings")
AGENTS = ("designer", "writer")      # without them Hub Design works half-way (the page installs them with a button; the same names as NEEDED in lib.js)
FACTS = {"styles": 2058, "gb": 2.1, "hours": "2-3"}

STR = {
    "en": {
        "title": "Hub Design: download the style library?",
        "body": "Preinstalled: {sources} style sources - the Refero site and the GitHub repositories of ready design, slide, email and iOS sets, "
                "about {styles} styles in all. Download: about {gb} GB of disk and {hours} hours in the background. Nothing is downloaded until you answer.",
        "agents": "For Hub Design to work well, the agents {names} are needed. Not in the hub yet: {missing}. "
                  "Ask the hub to install them, or press Install on the Hub Design page.",
        "agents_ok": "The agents {names} are already in the hub.",
        "yes": "Download",
        "no": "Don't download",
        "settings": "I'll change it in the settings",
        "settle": "Hub Design styles: {}",
    },
    "ru": {
        "title": "Hub Design: скачать библиотеку стилей?",
        "body": "Предустановлено: {sources} источников стилей - сайт Refero и репозитории GitHub с готовыми наборами дизайна, слайдов, писем и iOS, "
                "всего около {styles} стилей. Скачка: около {gb} ГБ на диске и {hours} часа в фоне. Пока вы не ответите, ничего не скачивается.",
        "agents": "Для нормальной работы Hub Design нужны агенты: {names}. В хабе пока нет: {missing}. "
                  "Попросите хаб поставить их или нажмите «Поставить» на странице Hub Design.",
        "agents_ok": "Агенты {names} уже в хабе.",
        "yes": "Качаем",
        "no": "Не качаем",
        "settings": "Поменяю в настройках",
        "settle": "Стили Hub Design: {}",
    },
}


def tr(lang, key, **params):
    base = (lang or "en").split("-")[0].lower()
    text = (STR.get(base) or STR["en"]).get(key) or STR["en"][key]
    return text.format(**params) if params else text


def choice_of(button):
    """The answer a pressed button stands for, in any language of the table (the language may have changed since); None - not our button."""
    for c in CHOICES:
        if any(t.get(c) == button for t in STR.values()):
            return c
    return None


def missing(sessions):
    """The needed agents that are not in the hub: sessions - the hub state's {name: session}; the hub's own session is not an agent."""
    sessions = sessions if isinstance(sessions, dict) else {}
    return [n for n in AGENTS if n not in sessions or (sessions[n] or {}).get("kind") == "hub"]


def text(lang, sources, lack):
    """The Telegram text of the question (the page draws its own from the same facts)."""
    names = ", ".join(AGENTS)
    tail = tr(lang, "agents", names=names, missing=", ".join(lack)) if lack else tr(lang, "agents_ok", names=names)
    return f"**{tr(lang, 'title')}**\n{tr(lang, 'body', sources=sources, **FACTS)}\n\n{tail}"
