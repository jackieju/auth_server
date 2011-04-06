
var DATA = require('./init').init(exports)
  , assert = DATA.assert
;

var http = require('http')
  , querystring = require('querystring')
  , URL = require('url')
  , util = require('util')
  , oauth2_server = require('oauth2-server')
  , base64 = require('base64')
  , extend = require('nodetk/utils').extend
  , web = require('nodetk/web')
  , config = require('../lib/config_loader').get_config()
  , model = require('../model')
;

var base_url = DATA.base_url
  , authorize_url = base_url + config.oauth2_server.authorize_url
  , login_url = base_url + config.oauth2_server.process_login_url
  , token_url = base_url + config.oauth2_server.token_url
;

/**
 * Returns a function checking the reply is an error.
 * Use assert two times.
 *
 * Arguments:
 *  - type: 'eua' or 'oat'
 *  - error_code: 'invalid_request', 'invalid_client'...
 */
var get_error_checker = function(type, error_code) {
  return function(statusCode, headers, data) {
    assert.equal(statusCode, 400);
    var error = JSON.parse(data);
    assert.deepEqual(error, {error: {
      type: 'OAuthException',
      message: error_code + ': ' + oauth2_server.ERRORS[type][error_code]
    }});
  };
};

exports.tests = [

['/oauth/authorize: no parameter', 2, function() {
  // no params (missing mandatory ones) should give us an error.
  web.GET(authorize_url, null, get_error_checker('eua', 'invalid_request'));
}],


['/oauth/authorize: missing mandatory param', 4, function() {
  // A missing mandatory param should give us an error.
  var qs = {
    client_id: DATA.client_id,
    response_type: "code"
  }
  oauth2_server.PARAMS.eua.mandatory.forEach(function(param) {
    var partial_qs = extend({}, qs);
    delete partial_qs[param];
    web.GET(authorize_url, partial_qs, get_error_checker('eua', 'invalid_request'));
  });
}],


/*['/oauth/authorize: bad client_id', 2, function() {
  // if the given client id is not in DB, error.
  web.GET(authorize_url, {
    client_id: "toto",
    response_type: "code",
    redirect_uri: "http://127.0.0.1:8888/login"
  }, get_error_checker('eua', 'invalid_client'));
}],*/

['/oauth/authorize: redirect_uri mismatch', 2, function() {
  // if the redirect_uri is not the same as registered: error.
  web.GET(authorize_url, {
    client_id: DATA.client_id,
    response_type: "code",
    redirect_uri: "http://127.0.0.1:8888/login/wrong"
  }, get_error_checker('eua', 'redirect_uri_mismatch'));
}],

['/oauth/authorize: unsupported_response_type', 2, function() {
  // if the response_type is not an accepted value: error.
  web.GET(authorize_url, {
    client_id: DATA.client_id,
    response_type: "wrong",
    redirect_uri: "http://127.0.0.1:8888/login"
  }, get_error_checker('eua', 'unsupported_response_type'));
}],

// -------------------------------------------------------------------------
// XXX : The two following tests are NOT norm compliant, cf ../oauth2.js
['/oauth/authorize: token response_type', 1, function() {
  web.GET(authorize_url, {
    client_id: DATA.client_id,
    response_type: "token",
    redirect_uri: "http://127.0.0.1:8888/login"
  }, function(statusCode, headers, data) {
    assert.equal(statusCode, 501)
  });
}],

['/oauth/authorize: code_and_token response_type', 1, function() {
  web.GET(authorize_url, {
    client_id: DATA.client_id,
    response_type: "code_and_token",
    redirect_uri: "http://127.0.0.1:8888/login"
  }, function(statusCode, headers, data) {
    assert.equal(statusCode, 501)
  });
}],
// -------------------------------------------------------------------------


['/oauth/authorize: ok', 1, function() {
  // if the response_type is not an accepted value: error.
  web.GET(authorize_url, {
    client_id: DATA.client_id,
    response_type: "code",
    redirect_uri: "http://127.0.0.1:8888/login"
  }, function(statusCode, headers, data) {
    assert.equal(statusCode, 200);
    // TODO: more checks here? -> check we have a form to log in.
  });
}],


['authentication ok', 8, function() {
  web.POST(login_url, {
    email: 'pruyssen@af83.com',
    password: '1234',
    info: base64.encode(new Buffer(JSON.stringify({
      client_id: 'errornot',
      response_type: 'code',
      state:'somestate',
      redirect_uri: 'http://127.0.0.1:8888/login'
    })))
  }, function(statusCode, headers, data) {
    assert.equal(statusCode, 303);
    var location = headers.location.split('?');
    assert.equal(location[0], 'http://127.0.0.1:8888/login');
    var qs = querystring.parse(location[1]);
    assert.equal(qs.state, 'somestate');
    assert.ok(qs.code);
    var id_code = qs.code.split('.');
    assert.equal(id_code.length, 2);
    model.Grant.getById(id_code[0], function(err, grant) {
      assert.equal(err, null);
      assert.ok(grant);
      assert.equal(grant.get('code'), id_code[1]);
    });
  });
}],


['authentication: wrong password', 1, function() {
  web.POST(login_url, {
    state: 'somestate',
    email: 'pruyssen@af83.com',
    password: '123456',
    info: base64.encode(new Buffer(JSON.stringify({
      client_id: 'errornot',
      response_type: 'code',
      state:'somestate',
      redirect_uri: 'http://127.0.0.1:8888/login'
    })))
  }, function(statusCode, headers, data) {
    assert.equal(statusCode, 401);
  });
}],


['authentication: unknown user', 1, function() {
  web.POST(login_url, {
    email: 'toto@af83.com',
    password: '123456',
    info: base64.encode(new Buffer(JSON.stringify({
      client_id: 'errornot',
      response_type: 'code',
      state:'somestate',
      redirect_uri: 'http://127.0.0.1:8888/login'
    })))
  }, function(statusCode, headers, data) {
    assert.equal(statusCode, 401);
  });
}],


// -------------------------------------------------------------------------


['/oauth/token: no parameters', 2, function() {
  web.POST(token_url, {}, get_error_checker('oat', 'invalid_request'));
}],


['/oauth/token: missing mandatory param', 8, function() {
  // A missing mandatory param should give us an error.
  var qs = {
    grant_type: "authorization_code",
    client_id: DATA.client_id,
    code: "some code",
    redirect_uri: "http://127.0.0.1:8888/login"
  }
  oauth2_server.PARAMS.oat.mandatory.forEach(function(param) {
    var partial_qs = extend({}, qs);
    delete partial_qs[param];
    web.POST(token_url, partial_qs, get_error_checker('oat', 'invalid_request'));
  });
}],


['/oauth/token: bad grant_type', 8, function() {
  ["password", "assertion", "refresh_token", "none"].forEach(function(type) {
    web.POST(token_url, {
      grant_type: type,
      client_id: DATA.client_id,
      code: "some code",
      redirect_uri: "http://127.0.0.1:8888/login"
    }, get_error_checker('oat', 'unsupported_grant_type'));
  });
}],


['/oauth/token: no client secret', 2, function() {
  web.POST(token_url, {
    grant_type: "authorization_code",
    client_id: DATA.client_id,
    code: "some code",
    redirect_uri: "http://127.0.0.1:8888/login"
  }, get_error_checker('oat', 'invalid_request'));
}],


['/oauth/token: Two client secrets', 2, function() {
  web.POST(token_url, {
    grant_type: "authorization_code",
    client_id: DATA.client_id,
    code: "some code",
    redirect_uri: "http://127.0.0.1:8888/login",
    client_secret: "somesecret"
  }, get_error_checker('oat', 'invalid_request'), {
    additional_headers: {"Authorization": "Basic somesecret"}
  });
}],


['/oauth/token: unknown client_id', 2, function() {
  web.POST(token_url, {
    grant_type: "authorization_code",
    client_id: "toto",
    code: "some code",
    client_secret: "some secret",
    redirect_uri: "http://127.0.0.1:8888/login"
  }, get_error_checker('oat', 'invalid_client'));
}],


['/oauth/token: bad secret in param', 2, function() {
  web.POST(token_url, {
    grant_type: "authorization_code",
    client_id: DATA.client_id,
    code: "some code",
    client_secret: "some secret",
    redirect_uri: "http://127.0.0.1:8888/login"
  }, get_error_checker('oat', 'invalid_client'));
}],


['/oauth/token: bad secret in header', 2, function() {
  web.POST(token_url, {
    grant_type: "authorization_code",
    client_id: DATA.client_id,
    code: "some code",
    redirect_uri: "http://127.0.0.1:8888/login",
  }, get_error_checker('oat', 'invalid_client'), {
    additional_headers: {"Authorization": "Basic some secret"}
  });
}],


['/oauth/token: no grant (secrets in param)', 2, function() {
  web.POST(token_url, {
    grant_type: "authorization_code",
    client_id: DATA.client_id,
    code: "some code",
    client_secret: "some secret string",
    redirect_uri: "http://127.0.0.1:8888/login"
  }, get_error_checker('oat', 'invalid_grant'));
}],


['/oauth/token: no grant (secrets in headers)', 2, function() {
  web.POST(token_url, {
    grant_type: "authorization_code",
    client_id: DATA.client_id,
    code: "some code",
    redirect_uri: "http://127.0.0.1:8888/login"
  }, get_error_checker('oat', 'invalid_grant'), {
    additional_headers: {"Authorization": "Basic some secret string"}
  });
}],


['/oauth/token: bad request_uri', 2, function() {
  web.POST(token_url, {
    grant_type: "authorization_code",
    client_id: DATA.client_id,
    client_secret: "some secret string",
    code: "some code",
    redirect_uri: "http://127.0.0.1:8888/toto"
  }, get_error_checker('oat', 'invalid_grant'));
}],


['/oauth/token: outdated grant', 5, function() {
  var grant = new model.Grant({
    client_id: DATA.client_id,
    time: parseInt(Date.now() - 60100)
  });
  grant.save(function(err) {
    assert.equal(err, null);
    setTimeout(function() { // To be sure the other connexion is aware of this.
      model.Grant.getById(grant.get('id'), function(err, grant) {
        assert.equal(err, null);
        assert.ok(grant != null, "The grand has not been saved yet...");
        // We need to check the grant was actually
        web.POST(token_url, {
          grant_type: "authorization_code",
          client_id: DATA.client_id,
          code: grant.get('id'),
          client_secret: "some secret string",
          redirect_uri: "http://127.0.0.1:8888/login"
        }, get_error_checker('oat', 'invalid_grant'));
      });
    }, 10);
  });
}],

['/oauth/token: ok with secret in params', 5, function() {
  var grant = new model.Grant({
    client_id: DATA.client_id,
    user_id: 'some_user_id',
    time: parseInt(Date.now() - 15000),
    code: "somecode",
    redirect_uri: "http://127.0.0.1:8888/login"
  });
  grant.save(function(err) {
    assert.equal(err, null);
    setTimeout(function() { // To be sure the other connexion is aware of this.
      model.Grant.getById(grant.get('id'), function(err, grant) {
        assert.equal(err, null);
        assert.ok(grant != null, "The grant has not been saved yet...");
        web.POST(token_url, {
          grant_type: "authorization_code",
          client_id: DATA.client_id,
          code: grant.get('id')+'.somecode',
          client_secret: "some secret string",
          redirect_uri: "http://127.0.0.1:8888/login"
        }, function(statusCode, headers, data) {
          assert.equal(statusCode, 200);
          assert.equal(headers['cache-control'], 'no-store');
          var token = JSON.parse(data);
          assert.ok(token.access_token);
        });
      });
    }, 10);
  });
}],

['GET /portable_contacts/@me/@self: return current user info', 5, function() {
  create_access_token(function(err, oauth_token) {
    assert.equal(null, err);
    var check_answer = function(statusCode, headers, body) {
      assert.equal(statusCode, 200);
      var content = JSON.parse(body);
      delete content.entry.id;
      assert.deepEqual(content, {
        startIndex: 0,
        itemsPerPage: 1,
        totalResults: 1,
        entry: {
            displayName: 'pruyssen',
            emails: [
              {value: 'pruyssen@af83.com'}
            ]
        }
      });
    };
    web.GET(base_url + '/portable_contacts/@me/@self', {oauth_token: oauth_token}, check_answer);
    web.GET(base_url + '/portable_contacts/@me/@self', {}, check_answer, {
      additional_headers: {'Authorization': 'OAuth '+oauth_token}
    });
  });
}],

['GET /portable_contacts/@me/@all: no param', 9, function() {
  create_access_token(function(err, oauth_token) {
    assert.equal(null, err);
    var check_answer = function(statusCode, headers, body) {
      assert.equal(statusCode, 200);
      var content = JSON.parse(body);
      assert.equal(content.entry.length, 2);
      assert.ok(!content.entry[0].user);
      assert.ok(!content.entry[0]._pl);
    };
    web.GET(base_url + '/portable_contacts/@me/@all', {oauth_token: oauth_token}, check_answer);
    web.GET(base_url + '/portable_contacts/@me/@all', {}, check_answer, {
      additional_headers: {'Authorization': 'OAuth '+oauth_token}
    });
  });
}],

['GET /portable_contacts/@me/@all: with email', 5, function() {
  create_access_token(function(err, oauth_token) {
    assert.equal(null, err);
    var check_answer = function(statusCode, headers, body) {
      assert.equal(statusCode, 200);
      var content = JSON.parse(body);
      assert.equal(content.entry.length, 1);
    };
    var params = {filterBy: 'emails.value',
                  filterOp: 'equals',
                  filterValue: 'JDoe@example.com',
                  oauth_token: oauth_token};
    web.GET(base_url + '/portable_contacts/@me/@all', params, check_answer);
    delete params.oauth_token;
    web.GET(base_url + '/portable_contacts/@me/@all', params, check_answer, {
      additional_headers: {'Authorization': 'OAuth '+oauth_token}
    });
  });
}],

['FilterOp contains is not implemented', 3, test_filter_op_not_implemented('contains')],
['FilterOp startwith is not implemented', 3, test_filter_op_not_implemented('startwith')],
['FilterOp present is not implemented', 3, test_filter_op_not_implemented('present')],

['GET /portable_contacts/@me/@all/:id', 4, function() {
  create_access_token(function(err, oauth_token) {
    assert.equal(null, err);
    var params = {oauth_token: oauth_token};
    var check_answer = function(statusCode, headers, body) {
      var users = JSON.parse(body);
      web.GET(base_url + '/portable_contacts/@me/@all/'+ users.entry[0].id, params, function(statusCode, headers, body) {
        assert.equal(statusCode, 200);
        var user = JSON.parse(body);
        assert.equal(1, user.totalResults);
        assert.equal(users.entry[0].displayName, user.entry.displayName);
      });
    };
    web.GET(base_url + '/portable_contacts/@me/@all', params, check_answer);
  });
}],

['POST /portable_contacts/@me/@all create user', 4, function() {
  create_access_token(function(err, oauth_token) {
    assert.equal(null, err);
    var params = {oauth_token: oauth_token};
    var check_answer = function(statusCode, headers, body) {
      var users = JSON.parse(body);
      var check_post = function (statusCode, headers, body) {
        var user = JSON.parse(body);
        assert.equal(1, user.totalResults);
        assert.equal('Chuck Norris', user.entry.displayName);
        web.GET(base_url + '/portable_contacts/@me/@all', params, function(statusCode, headers, body) {
          assert.equal(JSON.parse(body).entry.length, users.entry.length + 1);
        });
      }
      web.POST(base_url + '/portable_contacts/@me/@all?oauth_token='+ oauth_token, {'displayName': 'Chuck Norris'}, check_post);
    };
    web.GET(base_url + '/portable_contacts/@me/@all', params, check_answer);
  });
}]
]

function create_access_token(callback) {
  model.User.getByEmail('pruyssen@af83.com', function(err, user) {
    if (err) return callback(err);
    callback(null, oauth2_server.create_access_token(user.get('id'), DATA.client_id));
  });
}

function test_filter_op_not_implemented(filterOp) {
  return function() {
    create_access_token(function(err, oauth_token) {
      assert.equal(null, err);
      var check_answer = function(statusCode, headers, body) {
        assert.equal(statusCode, 503);
      };
      var params = {filterBy: 'emails.value',
                    filterOp: filterOp,
                    filterValue: 'JDoe@example.com',
                    oauth_token: oauth_token};
      web.GET(base_url + '/portable_contacts/@me/@all', params, check_answer);
      delete params.oauth_token;
      web.GET(base_url + '/portable_contacts/@me/@all', params, check_answer, {
        additional_headers: {'Authorization': 'OAuth '+oauth_token}
      });
    });
  }
}
