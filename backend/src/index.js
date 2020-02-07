import 'babel-polyfill';
import Koa from 'koa';
import Router from 'koa-router';
import mysql from 'mysql2/promise';
import KoaBody from 'koa-bodyparser';
import Url from 'url';

import { connectionSettings } from './settings';
import { databaseReady } from './helpers';
import { initDB } from './fixtures';

// Initialize DB
(async () =>  {
  await databaseReady();
  await initDB();
})();

// The port that this server will run on, defaults to 9000
const port = process.env.PORT || 9000;

// Instantiate a Koa server
const app = new Koa();
const koaBody = new KoaBody();

// Instantiate routers
const test = new Router();
const naytokset = new Router();

// Define API path
const apiPath = '/api/v1';

/*
const connectionSettings = {
  host: 'db',
  user: 'root',
  database: 'db_1',
  password: 'db_rootpass',
  namedPlaceholders: true,
}; */

test.get(`${apiPath}/test`, async (ctx) => {
  try {
    const conn = await mysql.createConnection(connectionSettings);
    const [data] = await conn.execute(`
        SELECT *
        FROM test_table
      `);

    console.log('Data fetched:', data);

    // Tell the HTTP response that it contains JSON data encoded in UTF-8
    ctx.type = 'application/json; charset=utf-8';

    // Add stuff to response body
    ctx.body = { greeting: 'Hello world!', data };
  } catch (error) {
    console.error('Error occurred:', error);
    ctx.throw(500, error);
  }
});

// Middleware for checking accept headers
const checkAccept = async (ctx, next) => {
  console.log('checkAccept');
  // If client does not accept 'application/json' as response type, throw '406 Not Acceptable'
  if (!ctx.accepts('application/json')) {
    ctx.throw(406);
  }
  // Set the response content type
  ctx.type = 'application/json; charset=utf-8';
  // Move to next middleware
  await next();
};

// Middleware for checking request body content
const checkContent = async (ctx, next) => {
  console.log('checkContent');
  // Check that the request content type is 'application/json'
  if (!ctx.is('application/json')) {
    ctx.throw(415, 'Request must be application/json');
  }
  // Move to next middleware
  await next();
};

// Define naytokset paths
const naytoksetPath = `${apiPath}/naytokset`;
const todoPath = `${naytoksetPath}/:id`;

// GET /resource
naytokset.get(naytoksetPath, checkAccept, async (ctx) => {
  const url = Url.parse(ctx.url, true);
  const { sort } = url.query;

  const parseSortQuery = ({ urlSortQuery, whitelist }) => {
    let query = '';
    if (urlSortQuery) {
      const sortParams = urlSortQuery.split(',');

      query = 'ORDER BY ';
      sortParams.forEach((param, index) => {
        let trimmedParam = param;
        let desc = false;

        if (param[0] === '-') {
          // Remove the first character
          trimmedParam = param.slice(1);
          // Set descending to true
          desc = true;
        }

        // If parameter is not whitelisted, ignore it
        // This also prevents SQL injection even without statement preparation
        if (!whitelist.includes(trimmedParam)) return;

        // If this is not the first sort parameter, append ', '
        if (index > 0) query = query.concat(', ');

        // Append the name of the field
        query = query.concat(trimmedParam);

        if (desc) query = query.concat(' DESC');
      });
    }
    return query;
  };
  const orderBy = parseSortQuery({ urlSortQuery: sort, whitelist: ['id', 'text', 'done'] });

  try {
    const conn = await mysql.createConnection(connectionSettings);
    const [data] = await conn.execute(`
    SELECT naytos.id, naytosaika, salin_nimi, elokuvan_nimi, ohjaaja, paaosissa, kuvaus, kesto_min
    FROM naytos
    JOIN elokuva
    ON elokuva.id = naytos.elokuva_id
    JOIN sali
    ON sali.id = naytos.sali_id;
    
        ${orderBy}
      `);

    // Return all naytokset
    ctx.body = data;
  } catch (error) {
    console.error('Error occurred:', error);
    ctx.throw(500, error);
  }

});

// GET /resource/:id
naytokset.get(todoPath, checkAccept, async (ctx) => {
  const { id } = ctx.params;
  console.log('.get id contains:', id);

  if (isNaN(id) || id.includes('.')) {
    ctx.throw(400, 'id must be an integer');
  }

  try {
    const conn = await mysql.createConnection(connectionSettings);
    const [data] = await conn.execute(`
          SELECT naytos.id, naytosaika, salin_nimi, elokuvan_nimi, ohjaaja, paaosissa, kuvaus, kesto_min
          FROM naytos
          JOIN elokuva
          ON elokuva.id = naytos.elokuva_id
          JOIN sali
          ON sali.id = naytos.sali_id
          WHERE naytos.id = :id;
        `, { id });

    // Return the resource
    ctx.body = data[0];
  } catch (error) {
    console.error('Error occurred:', error);
    ctx.throw(500, error);
  }

});

// POST /resource
naytokset.post(naytoksetPath, checkAccept, checkContent, koaBody, async (ctx) => {
  const { id } = ctx.params;
  const { naytosaika } = ctx.request.body;
  const { elokuva_id } = ctx.params;
  const { sali_id } = ctx.params;
  console.log('.post text contains:', text);

  if (typeof text === 'undefined') {
    ctx.throw(400, 'body.text is required');
  } else if (typeof text !== 'string') {
    ctx.throw(400, 'body.done must be string');
  }

  try {
    const conn = await mysql.createConnection(connectionSettings);

    // Insert a new todo
    const [status] = await conn.execute(`
          INSERT INTO naytos (id, naytosaika, elokuva_id, sali_id)
          VALUES (:id, :naytosaika, :elokuva_id, :sali_id);
        `, { id, naytosaika, elokuva_id, sali_id });
    const { insertId } = status;

    // Get the new todo
    const [data] = await conn.execute(`
          SELECT *
          FROM naytokset
          WHERE id = :id;
        `, { id: insertId });

    // Set the response header to 201 Created
    ctx.status = 201;

    // Set the Location header to point to the new resource
    const newUrl = `${ctx.host}${Router.url(todoPath, { id: insertId })}`;
    ctx.set('Location', newUrl);

    // Return the new todo
    ctx.body = data[0];
  } catch (error) {
    console.error('Error occurred:', error);
    ctx.throw(500, error);
  }

});

// PUT /resource/:id
naytokset.put(todoPath, checkAccept, checkContent, koaBody, async (ctx) => {
  const { id } = ctx.params;
  const { text, done } = ctx.request.body;
  console.log('.put id contains:', id);
  console.log('.put text contains:', text);
  console.log('.put done contains:', done);

  if (isNaN(id) || id.includes('.')) {
    ctx.throw(400, 'id must be an integer');
  } else if (typeof text === 'undefined') {
    ctx.throw(400, 'body.text is required');
  } else if (typeof text !== 'string') {
    ctx.throw(400, 'body.done must be string');
  } else if (typeof done === 'undefined') {
    ctx.throw(400, 'body.done is required');
  } else if (typeof done !== 'boolean') {
    ctx.throw(400, 'body.done must be boolean');
  }

  try {
    const conn = await mysql.createConnection(connectionSettings);

    // Update the todo
    const [status] = await conn.execute(`
           UPDATE naytokset
           SET naytosaika = :naytosaika, elokuva_id = :elokuva_id, sali_id = :sali_id
           WHERE id = :id;
         `, { naytosaika, elokuva_id, sali_id });

    if (status.affectedRows === 0) {
      // If the resource does not already exist, create it
      await conn.execute(`
          INSERT INTO naytokset (naytosaika, elokuva_id, sali_id)
          VALUES (:naytosaika, :elokuva_id, :sali_id);
        `, { id, naytosaika, elokuva_id, sali_id });
    }

    // Get the todo
    const [data] = await conn.execute(`
           SELECT *
           FROM naytokset
           WHERE id = :id;
         `, { id });

    // Return the resource
    ctx.body = data[0];
  } catch (error) {
    console.error('Error occurred:', error);
    ctx.throw(500, error);
  }

});

// DELETE /resource/:id
naytokset.del(todoPath, async (ctx) => {
  const { id } = ctx.params;
  console.log('.del id contains:', id);

  if (isNaN(id) || id.includes('.')) {
    ctx.throw(400, 'id must be an integer');
  }

  try {
    const conn = await mysql.createConnection(connectionSettings);
    const [status] = await conn.execute(`
          DELETE FROM naytos
          WHERE id = :id;
        `, { id });

    if (status.affectedRows === 0) {
      // The row did not exist, return '404 Not found'
      ctx.status = 404;
    } else {
      // Return '204 No Content' status code for successful delete
      ctx.status = 204;
    }
  } catch (error) {
    console.error('Error occurred:', error);
    ctx.throw(500, error);
  }

});


app.use(test.routes());
app.use(test.allowedMethods());
app.use(naytokset.routes());
app.use(naytokset.allowedMethods());

// Start the server and keep listening on port until stopped
app.listen(port);

console.log(`App listening on port ${port}`);
