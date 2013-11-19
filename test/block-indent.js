var Comb = require('../lib/csscomb');
var assert = require('assert');
var fs = require('fs');

describe('options/block-indent', function() {
    var comb;
    var input;
    var expected;

    function readFile(path) {
        return fs.readFileSync('test/block-indent/' + path, 'utf8');
    }

    beforeEach(function() {
        comb = new Comb();
    });

    it('Invalid Number value should not change space after brace', function() {
        input = readFile('invalid-number.css');

        comb.configure({ 'block-indent': 3.5 });
        assert.equal(comb.processString(input), input);
    });

    it('Invalid String value should not change space after brace', function() {
        input = readFile('invalid-string.css');

        comb.configure({ 'block-indent': 'foobar' });
        assert.equal(comb.processString(input), input);
    });

    it('True Boolean value should set 4 spaces indent', function() {
        input = readFile('true-boolean.css');
        expected = readFile('true-boolean.expected.css');

        comb.configure({ 'block-indent': true });
        assert.equal(comb.processString(input), expected);
    });

    it('Valid Number value should set equal space after brace', function() {
        input = readFile('valid-number.css');
        expected = readFile('valid-number.expected.css');

        comb.configure({ 'block-indent': 3 });
        assert.equal(comb.processString(input), expected);
    });

    it('Valid String value should set equal space after brace', function() {
        input = readFile('valid-string.css');
        expected = readFile('valid-string.expected.css');

        comb.configure({ 'block-indent': '\t' });
        assert.equal(comb.processString(input), expected);
    });
});
