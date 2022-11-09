import * as http from 'http';
var options = {
  timeout: 2000,
};
var url = 'http://localhost:8080/health';
var request = http.request(url, options, (res) => {
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
