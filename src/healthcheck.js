import * as http from 'http';

/**
 * Options for the HTTP request.
 * @type {object}
 * @property {number} timeout - Timeout for the request in milliseconds.
 */
const options = {
  timeout: 2000,
};

/**
 * The URL to make the HTTP request to.
 * @type {string}
 */
const url = 'http://localhost:8080/health';

/**
 * Makes an HTTP request to the health endpoint and checks the response.
 * Exits the process with a 0 status code if the health check is successful (status 200),
 * or with a 1 status code otherwise.
 */
const request = http.request(url, options, function (res) {
  console.log(`STATUS: ${res.statusCode}`);
  if (res.statusCode == 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

/**
 * Handles errors that occur during the HTTP request.
 * Logs an error message and exits the process with a 1 status code.
 * @param {Error} err - The error object.
 */
request.on('error', function (err) {
  console.log('ERROR');
  process.exit(1);
});

request.end();
