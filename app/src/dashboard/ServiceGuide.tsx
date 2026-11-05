import { useState } from "react";
import { X } from "lucide-react";
import { CopyButton } from "../components/CopyButton";

/** Services that come with a "use it in your project" guide. */
export type GuideId = "postgres" | "mariadb" | "mongodb" | "mailpit" | "redis" | "memcached";

interface Recipe {
  /** Tab name: the framework or language. */
  name: string;
  /** What to do, in one or two plain sentences. */
  intro: string;
  /** Where the code goes, e.g. ".env" or "PHP". */
  where?: string;
  code?: string;
  /** A step after the code, for example a command to run. */
  then?: string;
}

const GUIDES: Record<GuideId, { title: string; lede: string; recipes: Recipe[] }> = {
  memcached: {
    title: "Use Memcached in your project",
    lede: "Memcached listens on 127.0.0.1, port 11211, with no password; only this PC can connect. It holds 64 MB and forgets everything when it stops, as a cache should.",
    recipes: [
      {
        name: "Node.js",
        intro: "With the memjs package, connect like this.",
        where: "JavaScript",
        code: 'const cache = memjs.Client.create("127.0.0.1:11211");\nawait cache.set("greeting", "hello", { expires: 600 });',
      },
      {
        name: "Python",
        intro: "Install the client with pip install pymemcache in the Terminal, then connect.",
        where: "Python",
        code: 'client = pymemcache.client.base.Client(("127.0.0.1", 11211))\nclient.set("greeting", "hello")',
      },
      {
        name: "Laravel",
        intro:
          "Laravel's memcached cache needs PHP's memcached extension, which PHP for Windows doesn't include. Redis works out of the box instead: install it on the Versions page and use CACHE_STORE=redis.",
      },
    ],
  },
  mariadb: {
    title: "Use MariaDB in your project",
    lede: "MariaDB listens on 127.0.0.1, port 3307 (MySQL keeps 3306). Sign in as root with no password; only this PC can connect.",
    recipes: [
      {
        name: "Laravel",
        intro: "Create the database once in the Terminal, then set these in your project's .env.",
        where: "Terminal",
        code: 'mariadb -P 3307 -u root -e "CREATE DATABASE my_app;"',
        then: "In .env: DB_CONNECTION=mariadb, DB_HOST=127.0.0.1, DB_PORT=3307, DB_DATABASE=my_app, DB_USERNAME=root and an empty DB_PASSWORD=. Then run php artisan migrate.",
      },
      {
        name: "Plain PHP",
        intro: "PDO's MySQL driver talks to MariaDB too.",
        where: "PHP",
        code: "$db = new PDO('mysql:host=127.0.0.1;port=3307;dbname=my_app;charset=utf8mb4', 'root', '');",
      },
      {
        name: "WordPress",
        intro: "In wp-config.php, put the port after the host.",
        where: "wp-config.php",
        code: "define( 'DB_HOST', '127.0.0.1:3307' );\ndefine( 'DB_USER', 'root' );\ndefine( 'DB_PASSWORD', '' );",
      },
      {
        name: "Node.js",
        intro: "With the mariadb or mysql2 package, connect like this.",
        where: "JavaScript",
        code: 'const conn = await mysql.createConnection({ host: "127.0.0.1", port: 3307, user: "root", database: "my_app" });',
      },
    ],
  },
  mongodb: {
    title: "Use MongoDB in your project",
    lede: "MongoDB listens on 127.0.0.1, port 27017, with no sign-in; only this PC can connect. Databases are made the first time you write to them.",
    recipes: [
      {
        name: "Node.js",
        intro: "With Mongoose (or the mongodb package), connect like this.",
        where: "JavaScript",
        code: 'await mongoose.connect("mongodb://127.0.0.1:27017/my_app");',
      },
      {
        name: "Laravel",
        intro:
          "Laravel needs PHP's mongodb extension, which PHP for Windows doesn't include. Add php_mongodb.dll for your PHP version to its ext folder and turn it on under PHP settings, then run composer require mongodb/laravel-mongodb.",
        where: ".env",
        code: "DB_CONNECTION=mongodb\nDB_URI=mongodb://127.0.0.1:27017\nDB_DATABASE=my_app",
      },
      {
        name: "Python",
        intro: "Install the driver with pip install pymongo in the Terminal, then connect.",
        where: "Python",
        code: 'client = MongoClient("mongodb://127.0.0.1:27017")\ndb = client["my_app"]',
      },
    ],
  },
  postgres: {
    title: "Use PostgreSQL in your project",
    lede: "PostgreSQL listens on 127.0.0.1, port 5432. Sign in as postgres with no password; only this PC can connect.",
    recipes: [
      {
        name: "Laravel",
        intro: "Create the database once in the Terminal, then set these in your project's .env.",
        where: "Terminal",
        code: 'psql -U postgres -c "CREATE DATABASE my_app;"',
        then: "In .env: DB_CONNECTION=pgsql, DB_HOST=127.0.0.1, DB_PORT=5432, DB_DATABASE=my_app, DB_USERNAME=postgres and an empty DB_PASSWORD=. Then run php artisan migrate.",
      },
      {
        name: "Plain PHP",
        intro: "Connect with PDO. NexDB's PHP has the PostgreSQL driver turned on.",
        where: "PHP",
        code: "$pdo = new PDO('pgsql:host=127.0.0.1;port=5432;dbname=postgres', 'postgres', '');",
      },
      {
        name: "Terminal",
        intro: "psql, PostgreSQL's command line, is ready in NexDB's Terminal.",
        where: "Terminal",
        code: "psql -U postgres",
        then: "Type \\l to list databases and \\q to leave.",
      },
      {
        name: "Node.js",
        intro: "With the pg package, connect like this.",
        where: "JavaScript",
        code: 'const pool = new pg.Pool({ host: "127.0.0.1", port: 5432, user: "postgres", database: "postgres" });',
      },
      {
        name: "Python",
        intro: 'Install the driver with pip install "psycopg[binary]", then connect.',
        where: "Python",
        code: 'conn = psycopg.connect("host=127.0.0.1 port=5432 user=postgres dbname=postgres")',
      },
    ],
  },
  mailpit: {
    title: "Send your project's email to the mail catcher",
    lede: "Point your app's mail settings at 127.0.0.1, port 1025. No username, password or encryption. Every email then shows up under Open inbox instead of reaching anyone.",
    recipes: [
      {
        name: "Laravel",
        intro: "Set these in your project's .env. New Laravel projects made with NexDB already have them.",
        where: ".env",
        code: "MAIL_MAILER=smtp\nMAIL_HOST=127.0.0.1\nMAIL_PORT=1025\nMAIL_USERNAME=null\nMAIL_PASSWORD=null",
        then: "Then run php artisan config:clear in the project's terminal so Laravel reads the new settings.",
      },
      {
        name: "Plain PHP",
        intro: "Nothing to set up: NexDB's PHP already sends mail() to the catcher.",
        where: "PHP",
        code: 'mail("you@example.test", "Hello", "It works!", "From: app@example.test");',
      },
      {
        name: "WordPress",
        intro:
          "Nothing to set up: WordPress sends mail through PHP's mail(), which NexDB already points at the catcher. Password resets and contact forms land in the inbox.",
      },
      {
        name: "PHPMailer",
        intro: "Use SMTP with these settings.",
        where: "PHP",
        code: "$mail->isSMTP();\n$mail->Host = '127.0.0.1';\n$mail->Port = 1025;\n$mail->SMTPAuth = false;\n$mail->SMTPAutoTLS = false;",
      },
      {
        name: "Symfony",
        intro: "Set the mailer address in your .env.local.",
        where: ".env.local",
        code: "MAILER_DSN=smtp://127.0.0.1:1025",
      },
      {
        name: "Node.js",
        intro: "With Nodemailer, create the transport like this.",
        where: "JavaScript",
        code: 'const transport = nodemailer.createTransport({ host: "127.0.0.1", port: 1025, secure: false });',
      },
    ],
  },
  redis: {
    title: "Use Redis in your project",
    lede: "Redis listens on 127.0.0.1, port 6379, with no password. Start it on the Dashboard before your app needs it.",
    recipes: [
      {
        name: "Laravel",
        intro:
          "PHP on Windows doesn't include the Redis extension, so first run composer require predis/predis in the project's terminal. Then set these in .env:",
        where: ".env",
        code: "REDIS_CLIENT=predis\nREDIS_HOST=127.0.0.1\nREDIS_PORT=6379\nCACHE_STORE=redis",
        then: "Add SESSION_DRIVER=redis or QUEUE_CONNECTION=redis to move sessions or queues too, then run php artisan config:clear.",
      },
      {
        name: "Plain PHP",
        intro: "Install Predis with composer require predis/predis, then connect.",
        where: "PHP",
        code: "$redis = new Predis\\Client('tcp://127.0.0.1:6379');\n$redis->set('greeting', 'hello');",
      },
      {
        name: "Node.js",
        intro: "With the redis package, connect like this.",
        where: "JavaScript",
        code: 'const client = await createClient({ url: "redis://127.0.0.1:6379" }).connect();',
      },
    ],
  },
};

/** How to point a project at the mail catcher or Redis, with code to copy. */
export function ServiceGuide({ id, onClose }: { id: GuideId; onClose: () => void }) {
  const guide = GUIDES[id];
  const [tab, setTab] = useState(0);
  const recipe = guide.recipes[tab] ?? guide.recipes[0];
  return (
    <section className="dash-section svc-guide" aria-labelledby="svc-guide-title">
      <div className="svc-guide-head">
        <h2 id="svc-guide-title" className="section-title">
          {guide.title}
        </h2>
        <button type="button" className="log-clear" onClick={onClose} aria-label="Close the guide" title="Close">
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className="svc-guide-body">
        <p className="svc-guide-lede">{guide.lede}</p>
        <div className="log-tabs svc-guide-tabs" role="tablist" aria-label="Your project uses">
          {guide.recipes.map((r, i) => (
            <button key={r.name} role="tab" className="log-tab" aria-selected={i === tab} onClick={() => setTab(i)}>
              {r.name}
            </button>
          ))}
        </div>
        <div className="svc-guide-recipe" role="tabpanel" aria-label={recipe.name}>
          <p>{recipe.intro}</p>
          {recipe.code && (
            <div className="svc-guide-code">
              {recipe.where && <span className="svc-guide-where">{recipe.where}</span>}
              <pre>
                <code>{recipe.code}</code>
              </pre>
              <CopyButton text={recipe.code} label={`the ${recipe.name} settings`} />
            </div>
          )}
          {recipe.then && <p className="field-hint">{recipe.then}</p>}
        </div>
      </div>
    </section>
  );
}
