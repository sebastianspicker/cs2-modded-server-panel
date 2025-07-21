# CS2 Modded Server Panel

A modern Node.js/Express web panel to control and monitor your modded Counter-Strike 2 servers via RCON.

> **This repository is a fork of [shobhit-pathak/cs2-rcon-panel](https://github.com/shobhit-pathak/cs2-rcon-panel) with a strong focus on easy containerized deployment, especially as a [Pterodactyl](https://pterodactyl.io/) Egg.**

## Features

- Web interface for managing modded Counter-Strike 2 servers
- RCON connection & live console output
- User authentication (environment-based, bcrypt-secured)
- Server database & management UI
- Easy deployment with Docker and Pterodactyl Panel
- Full mod/plugin support (maps, configs, plugins.json, etc.)
- Ready-to-use for production

## Use with Pterodactyl

This repository is designed for **out-of-the-box use as a Pterodactyl Egg**.  
Simply use the provided [Egg configuration](./cs2-modded-server-panel_egg.json), point the Docker image to `sebastianspicker/cs2-modded-server-panel:latest`, and map the environment variables as needed.

You can also run it with Docker manually:

```bash
git clone https://github.com/sebastianspicker/cs2-modded-server-panel.git
cd cs2-modded-server-panel
docker build -t cs2-modded-server-panel .
docker run -d -p 3000:3000 \
  -e DEFAULT_USERNAME=youradmin \
  -e DEFAULT_PASSWORD=yourpassword \
  cs2-modded-server-panel
```

Panel will be available at `http://localhost:3000`.

## Environment Variables
Variable	Description	Default
`DEFAULT_USERNAME`	Default admin login username	`cspanel`
`DEFAULT_PASSWORD`	Default admin login password	`v67ic55x4ghvjfj`
`PORT`	Port the panel runs on	`3000`


## Project Structure
```
├── app.js
├── db.js
├── modules/
├── routes/
├── public/
├── views/
├── cfg/
├── Dockerfile
└── cs2-modded-server-panel_egg.json
```
