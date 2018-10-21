import fs from 'fs';
import path from 'path';

import gulp from 'gulp';

// Load all gulp plugins automatically
// and attach them to the `plugins` object
import plugins from 'gulp-load-plugins';

// Temporary solution until gulp 4
// https://github.com/gulpjs/gulp/issues/355
import runSequence from 'run-sequence';

import archiver from 'archiver';
import glob from 'glob';
import del from 'del';
import ssri from 'ssri';
import modernizr from 'modernizr';
import strip from 'gulp-strip-comments'

import pkg from './package.json';
import modernizrConfig from './modernizr-config.json';
import browserSyncBuilder from "browser-sync"
import prettify from 'gulp-html-prettify'

const USE_HTML = false

const browserSync = browserSyncBuilder.create();

const AUTOPREFIXER_BROWSERS = [
  'ie >= 10',
  'ie_mob >= 10',
  'ff >= 30',
  'chrome >= 34',
  'safari >= 7',
  'opera >= 23',
  'ios >= 7',
  'android >= 4.4',
  'bb >= 10'
];

const dirs = pkg['h5bp-configs'].directories;

const input = {
  style: './src/style/**/*.scss',
  js: './src/js/**/*.js',
  html: './src/index.html',
  pug: './src/index.pug'
}

const output = {
  style: './dist/css',
  js: './dist/js',
  html: './dist'
}

let isDevelMode = true

// ---------------------------------------------------------------------
// | Helper tasks                                                      |
// ---------------------------------------------------------------------

gulp.task('archive:create_archive_dir', () => {
  fs.mkdirSync(path.resolve(dirs.archive), '0755');
});

gulp.task('archive:zip', (done) => {
  const archiveName = path.resolve(dirs.archive, `${pkg.name}_v${pkg.version}.zip`);
  const zip = archiver('zip');
  const files = glob.sync('**/*.*', {
    'cwd': dirs.dist,
    'dot': true // include hidden files
  });
  const output = fs.createWriteStream(archiveName);

  zip.on('error', (error) => {
    done();
    throw error;
  });

  output.on('close', done);

  files.forEach((file) => {
    const filePath = path.resolve(dirs.dist, file);

    // `zip.bulk` does not maintain the file
    // permissions, so we need to add files individually
    zip.append(fs.createReadStream(filePath), {
      'name': file,
      'mode': fs.statSync(filePath).mode
    });
  });

  zip.pipe(output);
  zip.finalize();
});

gulp.task('clean', (done) => {
  del([
    dirs.archive,
    dirs.dist
  ]).then(() => {
    done();
  });
});

gulp.task('copy', [
  'copy:.htaccess',
  // 'copy:index.html',
  // 'copy:jquery',
  // 'copy:license',
  // 'copy:main.css',
  // 'copy:misc',
  // 'copy:normalize'
]);

gulp.task('copy:.htaccess', () =>
  gulp.src('node_modules/apache-server-configs/dist/.htaccess')
    .pipe(plugins().replace(/# ErrorDocument/g, 'ErrorDocument'))
    .pipe(gulp.dest(dirs.dist))
);

gulp.task('copy:jquery', () =>
  gulp.src(['node_modules/jquery/dist/jquery.min.js'])
    .pipe(plugins().rename(`jquery-${pkg.devDependencies.jquery}.min.js`))
    .pipe(gulp.dest(`${dirs.dist}/js/vendor`))
);

// gulp.task('copy:license', () =>
//   gulp.src('LICENSE.txt')
//     .pipe(gulp.dest(dirs.dist))
// );

// gulp.task('copy:main.css', () => {
//   // const banner = `/*! HTML5 Boilerplate v${pkg.version} | ${pkg.license} License | ${pkg.homepage} */\n\n`;

//   gulp.src(`${dirs.src}/css/main.css`)
//     // .pipe(plugins().header(banner))
//     // .pipe(plugins().autoprefixer({
//     //   browsers: ['last 2 versions', 'ie >= 9', '> 1%'],
//     //   cascade: false
//     // }))
//     .pipe(gulp.dest(`${dirs.dist}/css`));
// });

// gulp.task('copy:misc', () =>
//   gulp.src([

//     // Copy all files
//     `${dirs.src}`,

//     // Exclude the following files
//     // (other tasks will handle the copying of these files)
//     `!${dirs.src}/css/main.css`,
//     `!${dirs.src}/index.html`

//   ], {

//     // Include hidden files by default
//     dot: true

//   }).pipe(gulp.dest(dirs.dist))
// );

gulp.task('copy:normalize', () =>
  gulp.src('node_modules/normalize.css/normalize.css')
    .pipe(gulp.dest(`${dirs.dist}/css`))
);

gulp.task('copy:js', () => {
  return gulp.src(files.js).pipe(gulp.dest())
})

gulp.task('modernizr', (done) =>{
  modernizr.build(modernizrConfig, (code) => {
    const dir = `${dirs.dist}/js/vendor`

    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
    }

    fs.writeFile(`${dir}/modernizr-${pkg.devDependencies.modernizr}.min.js`, code, done);
  });
});

gulp.task("browser-sync", () => {
  browserSync.init({
    open: "local",
    browser: "google chrome",
    reloadOnRestart: true,
    files: [ output.style, output.js, output.html ],
    https: false,
    // httpModule: "http2",
    watch: true,
    watchOptions: {
      ignoreInitial: true,
      ignored: [ "*.txt", "*.map.css" ]
    },
    server: {
      baseDir: "./dist",
      // directory: true,
      // index: "./dist/index.html"
    },
    logLevel: "debug", // debug || info || silent
    logPrefix: "log: ",
    logConnections: false,
    logFileChanges: true,
    tunnel: false,
    online: false,
    notify: false,
    scrollProportionally: false,
    reloadDelay: 500,
    reloadDebounce: 0,
    injectChanges: true,
    minify: false,
    localOnly: true,
    codeSync: true,
    // proxy: {
    //   target: "localhost:8080",
    //   ws: true // enables websockets
    // },
    // ghostMode: {
    //   clicks: true,
    //   forms: true,
    //   scroll: false
    // }

  })

  // gulp.watch("dist/index.html").on('change', browserSync.reload)
})

gulp.task('lint:js', () =>
  gulp.src([
    'gulpfile.js',
    input.js,
    `${dirs.test}/*.js`
  ]).pipe(plugins().jscs())
    .pipe(plugins().eslint())
    .pipe(plugins().eslint.failOnError())
);

gulp.task('process:style', done => {
  let result = gulp.src(input.style)
    .pipe(plugins().sass().on('error', plugins().sass.logError))
    .pipe(plugins().autoprefixer({
      browsers: AUTOPREFIXER_BROWSERS,
      cascade: true
    }))

  if (!isDevelMode) {
    result = result
      .pipe(strip())
      .pipe(plugins().csso())
      // .pipe(browserSync.stream())
      // .pipe(browserSync.reload({stream: true}))
  }

  return result.pipe(gulp.dest(output.style))
});

gulp.task('process:js', done => {
  let result = gulp.src(input.js)

  if (!isDevelMode) {
    result = result
      .pipe(strip())
      .pipe(plugins().uglify())
  }

  return result.pipe(gulp.dest(output.js))
})

gulp.task('process:html', done => {
  // const hash = ssri.fromData(
  //   fs.readFileSync('node_modules/jquery/dist/jquery.min.js'),
  //   {algorithms: ['sha256']}
  // );
  // const version = pkg.devDependencies.jquery;
  const modernizrVersion = pkg.devDependencies.modernizr;

  let result = gulp.src(input.html)
    // .pipe(plugins().replace(/{{JQUERY_VERSION}}/g, version))
    .pipe(plugins().replace(/{{MODERNIZR_VERSION}}/g, modernizrVersion))
    // .pipe(plugins().replace(/{{JQUERY_SRI_HASH}}/g, hash.toString()))

  if (!isDevelMode) {
    result = result.pipe(plugins().htmlmin({
      collapseWhitespace: true,
      removeComments: true
    }))
  }

  return result.pipe(gulp.dest(output.html))
})

gulp.task('process:pug', done => {
  const modernizrVersion = pkg.devDependencies.modernizr;

  let result = gulp.src(input.pug)
      .pipe(plugins().pug())
      .pipe(plugins().replace(/{{MODERNIZR_VERSION}}/g, modernizrVersion))

  if (isDevelMode) {
    result = result.pipe(prettify({indent_char: ' ', indent_size: 2}))

  } else {
    result = result.pipe(plugins().htmlmin({
      collapseWhitespace: true,
      removeComments: true
    }))
  }

  return result.pipe(gulp.dest(output.html))
})

gulp.task('process', [
  'process:style',
  'process:js',
  USE_HTML ? 'process:html' : 'process:pug'
])

gulp.task('watch', [
  'watch:style',
  'watch:js',
  USE_HTML ? 'watch:html' : 'watch:pug'
])

gulp.task('watch:style', () => {
  gulp.watch(input.style, ['process:style'])
})

gulp.task('watch:js', () => {
  gulp.watch(input.js, ['process:js', 'lint:js'])
})

gulp.task('watch:html', () => {
  gulp.watch(input.html, ['process:html'])
})

gulp.task('watch:pug', () => {
  gulp.watch(input.pug, ['process:pug'])
})

gulp.task('mode:prod', () => {
  isDevelMode = false
})

gulp.task('mode:devel', () => {
  isDevelMode = true
})

// ---------------------------------------------------------------------
// | Main tasks                                                        |
// ---------------------------------------------------------------------

gulp.task('archive', (done) => {
  runSequence(
    'build',
    'archive:create_archive_dir',
    'archive:zip',
    done);
});

gulp.task('devel', done => {
  runSequence(
    'mode:devel',
    ['clean', 'lint:js'],
    'process',
    // 'copy',
    'modernizr',
    'watch',
    'browser-sync', done)
})

gulp.task('prod', (done) => {
  runSequence(
    'mode:prod',
    ['clean', 'lint:js'],
    'process',
    // 'copy',
    'modernizr',
    done);
});

gulp.task('default', ['devel']);
