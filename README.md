# Swiss picks map · スイスおすすめ地図

Interactive satellite map of the places in the Notion guide "Switzerland recommendations · スイスおすすめスポット".

- Aerial imagery and national map: © [swisstopo](https://www.swisstopo.admin.ch/) (SWISSIMAGE, national map, hiking trails), via Leaflet.
- Click a place in the list to fly to it; click a pin to highlight it in the list.
- Language: `?lang=ja` or `?lang=en` (defaults to the browser language). Link to a place with `#<notion-page-id>`.

## Updating the data

`places.json` is generated from a view-mode export of the Notion "Places" database:

```sh
python3 tools/build_places.py notion_view_dump.json places.json
```
