---
name: add-item
description: Test the pipeline end-to-end by submitting a URL and polling until processing completes. Usage: /add-item <url>
disable-model-invocation: true
---

Submit the URL provided as the argument to the local dev server:

1. POST to http://localhost:3000/api/items with body `{"url": "<argument>"}`. If connection refused, try port 3001 or 3002. If all fail, print "Dev server not running — start it with `npm run dev`" and stop.
2. Extract the returned `id`
3. Poll GET http://localhost:3000/api/items/<id> every 3 seconds (use the same port as step 1)
4. Stop when status is `ready` or `failed`, OR after 20 polls (~60 seconds). If timed out: print "Still processing after 60s — check server logs for errors."
5. Print: status, title, summary_short, tags
6. If failed: print error_message

Use Bash for the curl commands.
