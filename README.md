# logview

Web-based SQLite log viewer.  
**Requires**: Node.js 22.12 or later.

### Install & Update

```
sudo npm install -g ANDOR-Automation-AB/logview
```
Installs to `/usr/lib/node_modules/logview`.

**Start** logview by running ```logview``` in console.


### Uninstall

```
sudo npm uninstall -g logview
```

### Settings

Settings are stored in `~/.config/logview/settings.json` and created automatically on first start and saved automatically.

Configure settings by opening `http://<ip>:3000/settings` in a browser.

**Setup**  
Set the path to your SQLite database file, then select the table that contains your log data and the column that holds the log timestamp. Each row in the chart is configured separately — give it a name, pick which database column to plot as a line, and optionally define value bands that color the background based on numeric thresholds.

