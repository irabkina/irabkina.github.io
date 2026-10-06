---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
# date: set to the publish day when this goes live
draft: true
# Every post needs both: hero is 2400x1260, social preview is 1200x630 (JPEG in static/images/).
thumbnail: "images/{{ .File.ContentBaseName }}-hero.jpg"
images: ["images/{{ .File.ContentBaseName }}-social.jpg"]
---

