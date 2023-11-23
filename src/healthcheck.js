import * as http from 'http';
const options = {
  timeout: 2000,
};
const url = 'http://localhost:8080/health';
const request = http.request(url, options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  if (res.statusCode == 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});
request.on('error', function (err) {
  console.log('ERROR');
  process.exit(1);
});
request.end();
