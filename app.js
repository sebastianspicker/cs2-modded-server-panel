const bodyParser = require('body-parser');
const express = require('express');
const session = require('express-session');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: 'cs2rconpanel',
    resave: false,
    saveUninitialized: true,
  })
);

// Router direkt importieren (jede Datei endet mit: module.exports = router)
const gameRoutes = require('./routes/game');
const serverRoutes = require('./routes/server');
const authRoutes = require('./routes/auth');
// Neu: Status-Routen importieren
const statusRoutes = require('./routes/status');

const port = process.env.PORT || process.env.DEFAULT_PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Routen mounten
app.use('/', authRoutes);
app.use('/', serverRoutes);
app.use('/', gameRoutes);
// Neu: Status-Routen mounten
app.use('/', statusRoutes);

// Root-Route
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/servers');
  } else {
    res.render('login');
  }
});

if (require.main === module) {
  const server = app.listen(port, () => {
    // Pterodactyl egg expects: "Server is running on ${PORT}."
    const actualPort = server.address() && server.address().port ? server.address().port : port;
    console.log(`Server is running on ${actualPort}.`);
  });
}

module.exports = app;
