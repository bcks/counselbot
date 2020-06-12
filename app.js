var fs        = require('fs'),
  cheerio     = require('cheerio'),
  request     = require('request'),
  diff        = require('./htmldiff'),
  uuid        = require('node-uuid'),
  puppeteer     = require('puppeteer'),
  debug       = require('debug')('app:SCObot'),
  Twitter     = require('node-twitter');


var exec = require('child_process').exec;


var twitterRestClient = new Twitter.RestClient(
    'CONSUMER_KEY',
    'CONSUMER_SECRET',
    'TOKEN',
    'TOKEN_SECRET'
);

var url = 'https://www.justice.gov/sco';
var filename = ('./files/scobot.html');


var requestOptions = {
  url: url,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X x.y; rv:10.0) Gecko/20100101 Firefox/10.0',
    'Referer': 'https://www.justice.gov/',
  }
}


// get URL

request(requestOptions, function (error, response, body) {

  if (!error && response.statusCode == 200) {      
      var $ = cheerio.load(body);

      $('#block-doj-sharing-doj-sharing').remove();
      $('img').remove();
      $('.l-region--navigation').remove();
      $('nav').remove();
      $('script').remove();
      $('header').remove();

      var html = $('body').html();
      var title = 'Update on the Special Counsel’s Office web page';

      // read local file

      fs.readFile(filename, 'utf8', function(err, oldfile) {
        if (err) throw err;
        debug('OK: ' + filename);

        // compare
  
        var diffHtml = diff(oldfile, html);


        if (diffHtml) {

          debug("Found a diff!");

          var object = { 'title': title, 'uri':url };

          object.id = 'SCObot-' + uuid.v4();

          object.imagefile = '/tmp/' + object.id + '.png';
          object.imagefileSrc = '/tmp/' + object.id + '_source.png';
          object.imagefileCrop = '/tmp/' + object.id + '_crop.png';

          object.filename = filename;

          object.html = html; 
          
          diffHtml = diffHtml.replace(/(<img src([^>]+)>)/ig,"");
          diffHtml = diffHtml.replace(/&#xA0;/ig,"");
          // console.log(diffHtml);

          var imagefileCropHtml = '<html><head><link href="https://fonts.googleapis.com/css?family=Inconsolata" rel="stylesheet"><style>body,a{background-color:#e8e3de;color:rgba(255,255,255,0);font-family:"Inconsolata",monospace;}img{display: none;}ins{background-color:#9f9;color:#030;}del{background-color:#f99;color:#600;}</style></head><body>'+diffHtml+'</body></html>';
          
          var imagefileSrcHtml = '<html><head><link href="https://fonts.googleapis.com/css?family=Inconsolata" rel="stylesheet"><style>body{background-color:#e8e3de;font-family:"Inconsolata",monospace;}img{display: none;}ins{background-color:#9f9;color:#030;}del{background-color:#f99;color:#600;}</style></head><body>'+diffHtml+'</body></html>';

          async function runCrop() {
          
            try {
              const browser = await puppeteer.launch({dumpio: true, args: ['--no-sandbox']});

              var page0 = await browser.newPage();
              await page0.setContent(imagefileCropHtml);
              await page0.setViewport({width: 600, height: 5000, deviceScaleFactor: 2});
              await page0.screenshot({path: object.imagefileCrop});

              var page1 = await browser.newPage();
              await page1.setContent(imagefileCropHtml);
              await page1.setViewport({width: 600, height: 5000, deviceScaleFactor: 2});
              await page1.screenshot({path: object.imagefileCrop});

              var page2 = await browser.newPage();
              await page2.setContent(imagefileSrcHtml);
              await page2.setViewport({width: 600, height: 5000, deviceScaleFactor: 2});
              await page2.screenshot({path: object.imagefileSrc});

              await browser.close();
            }
            catch(e) {
                debug(`Error, ${e}`);
            }
            
              await cropImage(object);
            
          }

          runCrop();


          function cropImage(object) {

            setTimeout(function() {  
              
              exec('convert -trim ' + object.imagefileCrop + ' info:', 
                function(error, stdout, stderr) {
                  if (error !== null) {
                      debug('exec error: ' + error);
                  } else {
                                          
                    var convertOutput = stdout.split(' ');
                    var width = 1200;
                    var height = convertOutput[2].split('x')[1];
                    var cropX = 0;
                    var cropY = convertOutput[3].split('+')[2];

                    if (cropY == undefined) { cropY = 0; }

                    debug('convert stdout', stdout); 
                    debug('convertOutput', convertOutput); 

                    debug('crop width:', width); 
                    debug('crop height:', height); 
                    debug('crop cropX:', cropX); 
                    debug('crop cropY:', cropY); 

                    if (height == 1) {
                      debug('bad crop.');

                      fs.unlink(object.imagefileCrop, function (err) {
                        fs.unlink(object.imagefileSrc, function (err) {
                          fs.unlink(object.imagefile, function (err) {
                              debug('successfully deleted ' + object.imagefile);
                              process.exit(0);
                          });
                        });
                      });

                    }

                    exec('convert ' + object.imagefileSrc + ' -gravity NorthWest -crop ' + width + 'x' + height + '+' + cropX + '+' + cropY +' ' + object.imagefile,                         
                        function(err, stdout, stderr) {
                                if (err) throw err;
                                console.log('Cropped');
                                tweet(object);                                
                            }
                    );
                    
                  }
              });

            }, 2000); // 
            
            return;

          };
                                          

        } else {
            debug("No diff.");
        }


      }); // read file

  } // request success
}); // end request




function tweet(object) {

    //debug('Tweet' , object);

    twitterRestClient.statusesUpdateWithMedia(
        {
            'status': object.title + ' ' + object.uri,
            'media[]': object.imagefile
        },
        function(error, result) {
            
            debug('tweeted ' + object.title + ' ' + object.uri);

            fs.unlink(object.imagefileCrop, function (err) {
            fs.unlink(object.imagefileSrc, function (err) {
            fs.unlink(object.imagefile, function (err) {
                //if (err) throw err;
                debug('successfully deleted ' + object.imagefile);

                // write file
                fs.writeFile(object.filename, object.html, function(err) {
                    if(err) {
                        return debug(err);
                    }
                    debug("Updated HTML file was saved!");
                }); 

            });
            });
            });
            
            if (error) {
                debug('Twitter Error: ' + (error.code ? error.code + ' ' + error.message : error.message));
                debug(object.title);
            }

            //if (result) { debug("Twitter response:", result); }
        }
    );


}

