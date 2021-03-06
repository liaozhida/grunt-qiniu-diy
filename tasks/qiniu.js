'use strict';

var qiniu = require('../lib/qiniu'),
  rp = require('request-promise'),
  path = require('path');

module.exports = function(grunt) {

  grunt.registerMultiTask('qiniu', '增量同步文件夹', function() {
    var options = this.options({
      prefix: '',
      domain: ''
    });

    qiniu.init(options);

    if (!qiniu.check()) {
      grunt.log.error('必须填写七牛的ACCESS_KEY,SECRET_KEY,bucket');
      return false;
    }

    var token = qiniu.token();

    var _this = this;

    var done = _this.async();

    var num = 0;

    grunt.event.on('upload_over', function(f, result) {
      if (num === 0) {
        grunt.file.write(f.dest, JSON.stringify(result));
        if (options.domain) {
          qiniu.remove(f.dest, function() {
            qiniu.upload(token, f.dest, f.dest, function(err) {
              if (err) {
                grunt.log.writeln('!error ' + f.dest + ' ' + JSON.stringify(err));
              } else {
                grunt.log.writeln('!ok "' + f.dest + '"');
              }
              done();
            });
          });
        } else {
          done();
        }
      }
    });

    grunt.event.on('parse', function(f, result) {
      f.src.filter(function(filepath) {
        if (!grunt.file.exists(filepath)) {
          grunt.log.warn('Source file "' + filepath + '" not found.');
          return false;
        } else {
          return true;
        }
      }).map(function(filepath) {
        grunt.file.recurse(filepath, function(abspath, rootdir, subdir, filename) {
          if (filename.indexOf('.') === 0) { //过滤掉无用文件
            return true;
          }
          var key = options.prefix + subdir + '/' + filename;
          if (result[key]) { //过滤已经上传
            return true;
          }
          num++;
          qiniu.upload(token, key, path.join(options.path, abspath), function(err) {
            if (err) {
              grunt.log.writeln('!error "' + abspath + '" => "' + key + '" ' + JSON.stringify(err));
            } else {
              result[key] = true;
              grunt.log.writeln('!ok "' + abspath + '" => "' + key + '"');
            }
            num--;
            grunt.event.emit('upload_over', f, result);
          });
        });
      });
    });

    this.files.forEach(function(f) {
      var result = {};
      if (grunt.file.exists(f.dest)) {
        result = grunt.file.readJSON(f.dest);
        grunt.event.emit('parse', f, result);
      } else if (options.domain) { //从服务器下载
        rp(options.domain + '/' + f.dest + '?t=' + Math.random())
          .then(function(htmlString) {
            result = JSON.parse(htmlString);
            grunt.event.emit('parse', f, result);
          }).catch(function() {
            grunt.event.emit('parse', f, result);
          });
      } else {
        grunt.event.emit('parse', f, result);
      }
    });

  });

};