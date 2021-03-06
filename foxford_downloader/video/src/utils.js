const exec = require("child_process").exec;
const fs = require("fs");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { getYesNo, question } = require("cli-interact");
const chalk = require("chalk");
const request = require("request");
const progress = require("request-progress");

const Logger = require("./logger");
const LinkReader = require("./linkReader");

var lr = new LinkReader();
var lg = new Logger();

module.exports = {
  logger: lg,

  linkReader: lr,

  cliArgs: process.argv.slice(2).reduce((acc, arg) => {
      let [k, v] = arg.split('=');
      acc[k] = v === undefined ? true : /true|false/.test(v) ? v === 'true' : /(^[-+]?\d+\.\d+$)|(?<=\s|^)[-+]?\d+(?=\s|$)/.test(v) ? Number(v) : v;
      return acc;
  }, {}),

  executeCommand(cmd) {
    return new Promise(resolve => {
      exec(cmd, { maxBuffer: Infinity }, (error, stdout, stderr) => {
        error ? resolve({ stderr: stderr, stdout: stdout }) : resolve({ stderr: null, stdout: stdout });
      });
    });
  },

  queryCredentials() {
    return new Promise(resolve => {
      if (fs.existsSync(path.join(process.cwd(), 'credentials.db'))) {
        let db = new sqlite3.Database(path.join(process.cwd(), 'credentials.db'));

        db.serialize(() => {
          db.get("SELECT login, password FROM credentials LIMIT 1;", (err, row) => {
            if (err) throw err;

            db.close();
            resolve(row);
          });
        });

      } else {
        console.log(chalk.yellow('\nВойдите в свой аккаунт\n'));

        let login = question(chalk.green('Логин: '));
        let password = question(chalk.green('Пароль: '));

        let isReady = getYesNo(chalk.yellow(`Всё верно? ${login} : ${password}.`));

        if (isReady) {
          let db = new sqlite3.Database(path.join(process.cwd(), 'credentials.db'));

          db.serialize(() => {
            db.run("CREATE TABLE credentials(login TEXT, password TEXT);")
            db.run("INSERT INTO credentials VALUES(?, ?)", [login, password]);
          });

          db.close();
          resolve({ login, password });

        } else {
          process.exit(0);
        }
      }
    });
  },

  fetchContents(url) {
    return new Promise(resolve => {
      let destination = crypto.randomBytes(20).toString('hex') // 256^20 unique values
                          |> (rand => rand + ".m3u8")
                          |> (filename => path.join(process.cwd(), filename));

      let file = fs.createWriteStream(destination);

      let response = progress(request({
        method: 'GET',
        uri: url,
        headers: {
          'Connection': 'keep-alive'
        },
        jar: true
      }));

      response.on('end', () => {
        file.close(() => resolve({ error: null, writedTo: destination }));
      });

      response.on('error', err => {
        file.close(() => {
          fs.unlinkSync(destination);
          resolve({ error: err, writedTo: null });
        });
      });

      response.pipe(file);
    });
  }
};
