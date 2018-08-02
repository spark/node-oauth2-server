/**
 * Copyright 2013-present NightWorld.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var express = require('express'),
  bodyParser = require('body-parser'),
  request = require('supertest'),
  should = require('should'),
  OAuth2Error = require('../lib/error');

var oauth2server = require('../');

var bootstrap = function (oauthConfig) {
  var app = express(),
    oauth = oauth2server(oauthConfig || {
      model: {},
      grants: ['password', 'refresh_token', 'urn:custom:mfa-otp']
    });

  app.set('json spaces', 0);
  app.use(bodyParser());

  app.all('/oauth/token', oauth.grant());

  app.use(oauth.errorHandler());

  return app;
};

describe('Granting with mfa-otp grant type', function () {
  it('should still detect unsupported grant_type', function (done) {
    var app = bootstrap({
      model: {
        getClient: function (id, secret, callback) {
          callback(false, true);
        },
        grantTypeAllowed: function (clientId, grantType, callback) {
          callback(false, true);
        },
        extendedGrant: function (grantType, req, callback) {
          callback(false, false);
        }
      },
      grants: ['http://custom.com']
    });

    request(app)
      .post('/oauth/token')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({
        grant_type: 'http://custom.com',
        client_id: 'thom',
        client_secret: 'nightworld'
      })
      .expect(400, /invalid grant_type/i, done);
  });

  it('should require an mfa_token', function (done) {
    var app = bootstrap({
      model: {
        getClient: function (id, secret, callback) {
          callback(false, true);
        },
        grantTypeAllowed: function (clientId, grantType, callback) {
          callback(false, true);
        }
      },
      grants: ['urn:custom:mfa-otp']
    });

    request(app)
      .post('/oauth/token')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({
        grant_type: 'urn:custom:mfa-otp',
        otp: '123456',
        client_id: 'thom',
        client_secret: 'nightworld'
      })
      .expect(400, /You must provide otp and mfa token/i, done);
  });

  it('should require an otp', function (done) {
    var app = bootstrap({
      model: {
        getClient: function (id, secret, callback) {
          callback(false, true);
        },
        grantTypeAllowed: function (clientId, grantType, callback) {
          callback(false, true);
        }
      },
      grants: ['urn:custom:mfa-otp']
    });

    request(app)
      .post('/oauth/token')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({
        grant_type: 'urn:custom:mfa-otp',
        mfa_token: '123456',
        client_id: 'thom',
        client_secret: 'nightworld'
      })
      .expect(400, /You must provide otp and mfa token/i, done);
  });

  it('should return error from performMfaOtp', function (done) {
    var app = bootstrap({
      model: {
        getClient: function (id, secret, cb) {
          cb(false, { clientId: 'thom', clientSecret: 'nightworld' });
        },
        grantTypeAllowed: function (clientId, grantType, cb) {
          cb(false, true);
        },
        useMfaOtpGrant: function (grantType, req, cb) {
          req.oauth.client.clientId.should.equal('thom');
          req.oauth.client.clientSecret.should.equal('nightworld');
          cb(false, true, { id: 3 });
        },
        saveAccessToken: function (token, clientId, expires, user, scope, grantType, cb) {
          cb();
        },
        validateScope: function (scope, client, user, cb) {
          cb(false, '', false);
        },
        performMfaOtp: function (req, cb) {
          cb(new OAuth2Error('invalid_token', 'Could not validate OTP.'));
        }
      },
      grants: ['urn:custom:mfa-otp']
    });

    request(app)
      .post('/oauth/token')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({
        grant_type: 'urn:custom:mfa-otp',
        client_id: 'thom',
        client_secret: 'nightworld',
        mfa_token: '123456',
        otp: '123456'
      })
      .expect(401, /Could not validate OTP/i, done);
  });

  it('should passthrough valid request', function (done) {
    var app = bootstrap({
      model: {
        getClient: function (id, secret, cb) {
          cb(false, { clientId: 'thom', clientSecret: 'nightworld' });
        },
        grantTypeAllowed: function (clientId, grantType, cb) {
          cb(false, true);
        },
        useMfaOtpGrant: function (grantType, req, cb) {
          req.oauth.client.clientId.should.equal('thom');
          req.oauth.client.clientSecret.should.equal('nightworld');
          cb(false, true, { id: 3 });
        },
        saveAccessToken: function (token, clientId, expires, user, scope, grantType, cb) {
          cb();
        },
        validateScope: function (scope, client, user, cb) {
          cb(false, '', false);
        },
        performMfaOtp: function (req, cb) {
          cb(false, true, { id: 3 });
        }
      },
      grants: ['urn:custom:mfa-otp']
    });

    request(app)
      .post('/oauth/token')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({
        grant_type: 'urn:custom:mfa-otp',
        client_id: 'thom',
        client_secret: 'nightworld',
        mfa_token: '123456',
        otp: '123456'
      })
      .expect(200, done);
  });
});
