var gonzales = require('gonzales-pe');
var minimatch = require('minimatch');
var vow = require('vow');
var vfs = require('vow-fs');
var doNothing = function() {};

/**
 * Starts Code Style processing process.
 *
 * @constructor
 * @name Comb
 */
var Comb = function() {
    this.SUPPORTED_SYNTAXES = ['css', 'scss', 'less'];
    this._options = [
        'remove-empty-rulesets',
        'always-semicolon',
        'color-case',
        'color-shorthand',
        'element-case',
        'leading-zero',
        'strip-spaces',
        'eof-newline',
        'stick-brace',
        'colon-space',
        'combinator-space',
        'rule-indent',
        'block-indent',
        'unitless-zero',
        'sort-order',
        'vendor-prefix-align'
    ];
    this._exclude = null;
};

Comb.prototype = {

    /**
     * Get one of configuration files from `config` directory
     * @param {String} name Config's name: 'csscomb', 'zen' or 'yandex'
     * @returns {Object} Configuration object
     */
    getConfig: function(name) {
        name = name || 'csscomb';

        if (typeof name !== 'string') {
            throw new Error('Config name should be a string');
        }

        if (['csscomb', 'zen', 'yandex'].indexOf(name) < 0) {
            var message = name + ' is not a valid config name. Try one of ' +
                'the following: \'csscomb\', \'zen\' or \'yandex\'.';
            throw new Error(message);
        }

        return require('../config/' + name + '.json');
    },

    /**
     * Loads configuration from JSON.
     * Activates and configures required options.
     *
     * @param {Object} config
     */
    configure: function(config) {
        this._handlers = [];
        this._options.forEach(function(option) {
            if (typeof config[option] === 'undefined') return;

            try {
                var handler = require('./options/' + option).setValue(config[option]);
                handler && this._handlers.push(handler);
            } catch (e) {
                console.warn('Error loading "%s" handler: %s', option, e.message);
            }
        }, this);

        this._exclude = (config.exclude || []).map(function(pattern) {
            return new minimatch.Minimatch(pattern);
        });

        this.processed = 0;
        this.tbchanged = 0;
        this.changed = 0;
        this._verbose = config.verbose;
        this._lint = config.lint;
    },

    /**
     * Processes stylesheet tree node.
     *
     * @param {Array} tree Parsed tree
     * @returns {Array}
     */
    processTree: function(tree) {

        // We walk across complete tree for each handler,
        // because we need strictly maintain order in which handlers work,
        // despite fact that handlers work on different level of the tree.
        this._handlers.forEach(function(handler) {
            this.processNode(['tree', tree], 0, handler);
        }, this);
        return tree;
    },

    /**
     * Processes tree node.
     * @param {Array} node Tree node
     * @param {Number} level Indent level
     */
    processNode: function(node, level, handler) {
        node.forEach(function(node) {
            if (!Array.isArray(node)) return;

            var nodeType = node.shift();
            handler.process(nodeType, node, level);
            node.unshift(nodeType);

            if (nodeType === 'atrulers') level++;

            this.processNode(node, level, handler);
        }, this);
    },

    /**
     * Process file provided with a string.
     * @param {String} text
     * @param {String} [syntax] Syntax name (e.g. `scss`)
     * @param {String} [filename]
     */
    processString: function(text, syntax, filename) {
        if (!text) return text;
        var tree;
        var string = JSON.stringify;
        try {
            tree = gonzales.cssToAST({ syntax: syntax, css: text });
        } catch (e) {
            throw new Error('Parsing error at ' + filename + ': ' + e.message);
        }
        if (typeof tree === 'undefined') {
            throw new Error('Undefined tree at ' + filename + ': ' + string(text) + ' => ' + string(tree));
        }
        tree = this.processTree(tree);
        return gonzales.astToCSS({ syntax: syntax, ast: tree });
    },

    /**
     * Process single file.
     *
     * @param {String} path
     * @returns {Promise}
     */
    processFile: function(path) {
        var _this = this;
        if (this._shouldProcessFile(path)) {
            return vfs.read(path, 'utf8').then(function(data) {
                var syntax = path.split('.').pop();
                var processedData = _this.processString(data, syntax, path);
                var changed = data !== processedData;
                var lint = _this._lint;

                var tick = changed ? (lint ? '!' : '✓') : ' ';
                var message = _this._verbose ? console.log.bind(null, tick, path) : doNothing;

                _this.processed++;
                changed && _this.tbchanged++;

                if (!changed || lint) {
                    message();
                } else {
                    return vfs.write(path, processedData, 'utf8').then(function() {
                        _this.changed++;
                        message();
                    });
                }
            });
        }
        return null;
    },

    /**
     * Process directory recursively.
     *
     * @param {String} path
     * @returns {Promise}
     */
    processDirectory: function(path) {
        var _this = this;
        return vfs.listDir(path).then(function(filenames) {
            return vow.all(filenames.map(function(filename) {
                var fullname = path + '/' + filename;
                return vfs.stat(fullname).then(function(stat) {
                    if (stat.isDirectory()) {
                        return _this._shouldProcess(fullname) && _this.processDirectory(fullname);
                    } else {
                        return vow.when(_this.processFile(fullname)).then(function(errors) {
                            if (errors) return errors;
                        });
                    }
                });
            })).then(function(results) {
                return [].concat.apply([], results);
            });
        });
    },

    /**
     * Process directory or file.
     *
     * @param {String} path
     */
    processPath: function(path) {
        path = path.replace(/\/$/, '');
        var _this = this;
        return vfs.exists(path).then(function(exists) {
            if (exists) {
                return vfs.stat(path).then(function(stat) {
                    if (stat.isDirectory()) {
                        return _this.processDirectory(path);
                    } else {
                        return vow.when(_this.processFile(path)).then(function(errors) {
                            if (errors) return [errors];
                            return;
                        });
                    }
                });
            } else {
                throw new Error('Path ' + path + ' was not found.');
            }
        });
    },

    /**
     * Returns true if specified path is not in excluded list.
     *
     * @returns {Boolean}
     */
    _shouldProcess: function(path) {
        path = path.replace(/^\.\//, '');
        var exclude = this._exclude;
        for (var i = exclude.length; i--;) {
            if (exclude[i].match(path)) return false;
        }
        return true;
    },

    /**
     * Returns true if specified path is not in excluded list and has one of
     * acceptable extensions.
     *
     * @returns {Boolean}
     */
    _shouldProcessFile: function(path) {
        // Get file's extension:
        var syntax = path.split('.').pop();
        // Check if syntax is supported. If not, ignore the file:
        if (this.SUPPORTED_SYNTAXES.indexOf(syntax) < 0) {
            return false;
        }

        return this._shouldProcess(path);
    }
};

module.exports = Comb;
