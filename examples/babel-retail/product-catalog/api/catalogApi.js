'use strict';

var AJV = require('ajv');

var aws = require('aws-sdk'); // eslint-disable-line import/no-unresolved, import/no-extraneous-dependencies
// TODO Get these from a better place later


var categoryRequestSchema = {
  "$schema": "http://json-schema.org/schema#",
  "self": {
    "vendor": "com.nordstrom",
    "name": "categories/request",
    "format": "jsonschema",
    "version": "1-0-0"
  },
  "type": "object",
  "properties": {
    "path":                   { "type": "string", "pattern": "^/categories$" },
    "httpMethod":             { "type": "string", "pattern": "^GET$" }
  },
  "required": [
    "path",
    "httpMethod"
  ],
  "additionalProperties": true
};

var categoryItemsSchema = {
  "$schema": "http://json-schema.org/schema#",
  "self": {
    "vendor": "com.nordstrom",
    "name": "category/items",
    "format": "jsonschema",
    "version": "1-0-0"
  },
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "category":   { "type": "string" }
    },
    "required": [
      "category"
    ],
    "additionalProperties": false
  },
  "additionalProperties": false
};

var productsRequestSchema = {
  "$schema": "http://json-schema.org/schema#",
  "self": {
    "vendor": "com.nordstrom",
    "name": "products/request",
    "format": "jsonschema",
    "version": "1-0-0"
  },
  "type": "object",
  "properties": {
    "path":                   { "type": "string", "pattern": "^/products$" },
    "httpMethod":             { "type": "string", "pattern": "^GET$" },
    "queryStringParameters":  {
      "type": "object",
      "properties": {
        "category":           { "type": "string" }
      },
      "required": [
        "category"
      ],
      "additionalProperties": false
    }
  },
  "required": [
    "path",
    "httpMethod",
    "queryStringParameters"
  ],
  "additionalProperties": true
};

var productItemsSchema = {
  "$schema": "http://json-schema.org/schema#",
  "self": {
    "vendor": "com.nordstrom",
    "name": "product/items",
    "format": "jsonschema",
    "version": "1-0-0"
  },
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id":           { "type": "string", "pattern": "^[\\d]+$" },
      "brand":        { "type": "string" },
      "name":         { "type": "string" },
      "description":  { "type": "string" },
      "image":        { "type": "string" }
    },
    "required": [
      "id",
      "brand",
      "name",
      "description"
    ],
    "additionalProperties": false
  },
  "additionalProperties": false
}; // TODO generalize this?  it is used by but not specific to this module


var makeSchemaId = function makeSchemaId(schema) {
  return "".concat(schema.self.vendor, "/").concat(schema.self.name, "/").concat(schema.self.version);
};

var categoryRequestSchemaId = makeSchemaId(categoryRequestSchema);
var categoryItemsSchemaId = makeSchemaId(categoryItemsSchema);
var productsRequestSchemaId = makeSchemaId(productsRequestSchema);
var productItemsSchemaId = makeSchemaId(productItemsSchema);
var ajv = new AJV();
ajv.addSchema(categoryRequestSchema, categoryRequestSchemaId);
ajv.addSchema(categoryItemsSchema, categoryItemsSchemaId);
ajv.addSchema(productsRequestSchema, productsRequestSchemaId);
ajv.addSchema(productItemsSchema, productItemsSchemaId);
var dynamo = new aws.DynamoDB.DocumentClient();
var constants = {
  // self
  MODULE: 'product-catalog/catalogApi.js',
  // methods
  METHOD_CATEGORIES: 'categories',
  METHOD_PRODUCTS: 'products',
  // resources
  TABLE_PRODUCT_CATEGORY_NAME: 'PRODUCT_CATEGORY_TABLE',
  TABLE_PRODUCT_CATALOG_NAME: 'PRODUCT_TABLE',
  //
  INVALID_REQUEST: 'Invalid Request',
  INTEGRATION_ERROR: 'Integration Error',
  HASHES: '##########################################################################################',
  SECURITY_RISK: '!!!SECURITY RISK!!!',
  DATA_CORRUPTION: 'DATA CORRUPTION'
};
var impl = {
  response: function response(statusCode, body) {
    return {
      statusCode: statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS

      },
      body: body
    };
  },
  clientError: function clientError(schemaId, ajvErrors, event) {
    return impl.response(400, "".concat(constants.METHOD_CATEGORIES, " ").concat(constants.INVALID_REQUEST, " could not validate request to '").concat(schemaId, "' schema. Errors: '").concat(ajvErrors, "' found in event: '").concat(JSON.stringify(event), "'") // eslint-disable-line comma-dangle
    );
  },
  dynamoError: function dynamoError(err) {
    // // console.log(err);
    return impl.response(500, "".concat(constants.METHOD_CATEGORIES, " - ").concat(constants.INTEGRATION_ERROR));
  },
  securityRisk: function securityRisk(schemaId, ajvErrors, items) {
    // // console.log(constants.HASHES);
    // // console.log(constants.SECURITY_RISK);
    // // console.log("".concat(constants.METHOD_CATEGORIES, " ").concat(constants.DATA_CORRUPTION, " could not validate data to '").concat(schemaId, "' schema. Errors: ").concat(ajvErrors));
    // // console.log("".concat(constants.METHOD_CATEGORIES, " ").concat(constants.DATA_CORRUPTION, " bad data: ").concat(JSON.stringify(items)));
    // // console.log(constants.HASHES);
    return impl.response(500, "".concat(constants.METHOD_CATEGORIES, " - ").concat(constants.INTEGRATION_ERROR));
  },
  success: function success(items) {
    return impl.response(200, JSON.stringify(items));
  }
};

function categories(event, context, callback) {
  // TODO deal with pagination
  if (!ajv.validate(categoryRequestSchemaId, event)) {
    // bad request
    callback(null, impl.clientError(categoryRequestSchemaId, ajv.errorsText()), event);
  } else {
    var params = {
      TableName: constants.TABLE_PRODUCT_CATEGORY_NAME,
      AttributesToGet: ['category']
    };
    dynamo.scan(params, function (err, data) {
      if (err) {
        // error from dynamo
        callback(null, impl.dynamoError(err));
      } else if (!ajv.validate(categoryItemsSchemaId, data.Items)) {
        // bad data in dynamo
        callback(null, impl.securityRisk(categoryItemsSchemaId, ajv.errorsText()), data.Items); // careful if the data is sensitive
      } else {
        // valid
        callback(null, impl.success(data.Items));
      }
    });
  }
}

function products(event, context, callback) {
  if (!ajv.validate(productsRequestSchemaId, event)) {
    // bad request
    callback(null, impl.clientError(productsRequestSchemaId, ajv.errorsText(), event));
  } else {
    var params = {
      TableName: constants.TABLE_PRODUCT_CATALOG_NAME,
      IndexName: 'Category',
      ProjectionExpression: '#i, #b, #n, #d',
      KeyConditionExpression: '#c = :c',
      ExpressionAttributeNames: {
        '#i': 'id',
        '#c': 'category',
        '#b': 'brand',
        '#n': 'name',
        '#d': 'description'
      },
      ExpressionAttributeValues: {
        ':c': event.queryStringParameters.category
      }
    };
    dynamo.query(params, function (err, data) {
      if (err) {
        // error from dynamo
        callback(null, impl.dynamoError(err));
      } else if (!ajv.validate(productItemsSchemaId, data.Items)) {
        // bad data in dynamo
        callback(null, impl.securityRisk(productItemsSchemaId, ajv.errorsText()), data.Items); // careful if the data is sensitive
      } else {
        // valid
        callback(null, impl.success(data.Items));
      }
    });
  }
}

var api = {
  categories: categories,
  // TODO this is only filter/query impl, also handle single item request
  // TODO deal with pagination
  products: products
};
module.exports = {
  categories: api.categories,
  products: api.products
};

module.exports.categories({}, null, function() {});
module.exports.products({queryStringParameters: {category: TAJS_make('AnyStr')}}, null, function(){});