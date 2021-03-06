'use strict';

var aws = require('aws-sdk'); // eslint-disable-line import/no-unresolved, import/no-extraneous-dependencies


var KH = require('kinesis-handler'); // TODO Get these from a better place later


var eventSchema = {
  "$schema": "http://json-schema.org/schema#",
  "self": {
    "vendor": "com.nordstrom",
    "name": "retail-stream-ingress",
    "format": "jsonschema",
    "version": "1-0-0"
  },
  "type": "object",
  "properties": {
    "schema":      { "type": "string", "format": "url" },
    "followsFrom": { "type": "string" },
    "origin":      { "type": "string" },
    "timeOrigin":  { "type": "string", "format": "date-time" },
    "data": {
      "type": "object",
      "properties": {
        "schema": { "type": "string", "format": "url" }
      },
      "required": [
        "schema"
      ],
      "additionalProperties": true
    }
  },
  "required": [
    "schema",
    "origin",
    "timeOrigin",
    "data"
  ],
  "additionalProperties": false
};

var productCreateSchema = {
  "$schema": "http://json-schema.org/schema#",
  "self": {
    "vendor": "com.nordstrom",
    "name": "product/create",
    "format": "jsonschema",
    "version": "1-0-0"
  },
  "type": "object",
  "properties": {
    "schema":  { "type": "string", "format": "url" },
    "id": { "type": "string" },
    "brand":  { "type": "string" },
    "name":  { "type": "string" },
    "description": { "type": "string" },
    "category": { "type": "string"}
  },
  "required": [
    "schema",
    "id",
    "brand",
    "name",
    "description",
    "category"
  ],
  "additionalProperties": false
};

var productImageSchema = {
      "$schema": "http://json-schema.org/schema#",
      "self": {
        "vendor": "com.nordstrom",
        "name": "product/image",
        "format": "jsonschema",
        "version": "1-0-0"
      },
      "type": "object",
      "properties": {
        "schema":  { "type": "string", "format": "url" },
        "id": { "type": "string" },
        "image":  { "type": "string" }
      },
      "required": [
        "schema",
        "id",
        "image"
      ],
      "additionalProperties": false
    };

var constants = {
  // self
  MODULE: 'product-catalog/catalog.js',
  // methods
  METHOD_PUT_PRODUCT: 'putProduct',
  METHOD_PUT_IMAGE: 'putImage',
  // resources
  TABLE_PRODUCT_CATEGORY_NAME: 'PRODUCT_CATEGORY_TABLE',
  TABLE_PRODUCT_CATALOG_NAME: 'PRODUCT_TABLE'
};
var kh = new KH.KinesisHandler(eventSchema, constants.MODULE);
var dynamo = new aws.DynamoDB.DocumentClient();
var impl = {
  /**
   * Put the given product in to the dynamo catalog.  Example event:
   * {
   *   "schema": "com.nordstrom/retail-stream/1-0-0",
   *   "origin": "hello-retail/product-producer-automation",
   *   "timeOrigin": "2017-01-12T18:29:25.171Z",
   *   "data": {
   *     "schema": "com.nordstrom/product/create/1-0-0",
   *     "id": "4579874",
   *     "brand": "POLO RALPH LAUREN",
   *     "name": "Polo Ralph Lauren 3-Pack Socks",
   *     "description": "PAGE:/s/polo-ralph-lauren-3-pack-socks/4579874",
   *     "category": "Socks for Men"
   *   }
   * }
   * @param event The product to put in the catalog.
   * @param complete The callback to inform of completion, with optional error parameter.
   */
  putProduct: function putProduct(event, complete) {
    var updated = Date.now();
    var priorErr;

    var updateCallback = function updateCallback(err) {
      if (priorErr === undefined) {
        // first update result
        if (err) {
          priorErr = err;
        } else {
          priorErr = false;
        }
      } else if (priorErr && err) {
        // second update result, if an error was previously received and we have a new one
        complete("".concat(constants.METHOD_PUT_PRODUCT, " - errors updating DynamoDb: ").concat([priorErr, err]));
      } else if (priorErr || err) {
        complete("".concat(constants.METHOD_PUT_PRODUCT, " - error updating DynamoDb: ").concat(priorErr || err));
      } else {
        // second update result if error was not previously seen
        complete();
      }
    };

    var dbParamsCategory = {
      TableName: constants.TABLE_PRODUCT_CATEGORY_NAME,
      Key: {
        category: event.data.category
      },
      UpdateExpression: ['set', '#c=if_not_exists(#c,:c),', '#cb=if_not_exists(#cb,:cb),', '#u=:u,', '#ub=:ub'].join(' '),
      ExpressionAttributeNames: {
        '#c': 'created',
        '#cb': 'createdBy',
        '#u': 'updated',
        '#ub': 'updatedBy'
      },
      ExpressionAttributeValues: {
        ':c': updated,
        ':cb': event.origin,
        ':u': updated,
        ':ub': event.origin
      },
      ReturnValues: 'NONE',
      ReturnConsumedCapacity: 'NONE',
      ReturnItemCollectionMetrics: 'NONE'
    };
    dynamo.update(dbParamsCategory, updateCallback);
    var dbParamsProduct = {
      TableName: constants.TABLE_PRODUCT_CATALOG_NAME,
      Key: {
        id: event.data.id
      },
      UpdateExpression: ['set', '#c=if_not_exists(#c,:c),', '#cb=if_not_exists(#cb,:cb),', '#u=:u,', '#ub=:ub,', '#b=:b,', '#n=:n,', '#d=:d,', '#cat=:cat'].join(' '),
      ExpressionAttributeNames: {
        '#c': 'created',
        '#cb': 'createdBy',
        '#u': 'updated',
        '#ub': 'updatedBy',
        '#b': 'brand',
        '#n': 'name',
        '#d': 'description',
        '#cat': 'category'
      },
      ExpressionAttributeValues: {
        ':c': updated,
        ':cb': event.origin,
        ':u': updated,
        ':ub': event.origin,
        ':b': event.data.brand,
        ':n': event.data.name,
        ':d': event.data.description,
        ':cat': event.data.category
      },
      ReturnValues: 'NONE',
      ReturnConsumedCapacity: 'NONE',
      ReturnItemCollectionMetrics: 'NONE'
    };
    dynamo.update(dbParamsProduct, updateCallback);
  },

  /**
   * Put the given image in to the dynamo catalog.  Example event:
   * {
   *   "schema": "com.nordstrom/retail-stream/1-0-0",
   *   "origin": "hello-retail/product-producer-automation",
   *   "timeOrigin": "2017-01-12T18:29:25.171Z",
   *   "data": {
   *     "schema": "com.nordstrom/product/image/1-0-0",
   *     "id": "4579874",
   *     "image": "erik.hello-retail.biz/i/p/4579874"
   *   }
   * }
   * @param event The product to put in the catalog.
   * @param complete The callback to inform of completion, with optional error parameter.
   */
  putImage: function putImage(event, complete) {
    var updated = Date.now();
    var dbParamsProduct = {
      TableName: constants.TABLE_PRODUCT_CATALOG_NAME,
      Key: {
        id: event.data.id
      },
      UpdateExpression: ['set', '#c=if_not_exists(#c,:c),', // TODO this probably isn't necessary since a photo should never be requested until after product create...?
      '#cb=if_not_exists(#cb,:cb),', '#u=:u,', '#ub=:ub,', '#i=:i'].join(' '),
      ExpressionAttributeNames: {
        '#c': 'created',
        '#cb': 'createdBy',
        '#u': 'updated',
        '#ub': 'updatedBy',
        '#i': 'image'
      },
      ExpressionAttributeValues: {
        ':c': updated,
        ':cb': event.origin,
        ':u': updated,
        ':ub': event.origin,
        ':i': event.data.image
      },
      ReturnValues: 'NONE',
      ReturnConsumedCapacity: 'NONE',
      ReturnItemCollectionMetrics: 'NONE'
    };
    dynamo.update(dbParamsProduct, complete);
  }
};
kh.registerSchemaMethodPair(productCreateSchema, impl.putProduct);
kh.registerSchemaMethodPair(productImageSchema, impl.putImage);
module.exports = {
  processKinesisEvent: kh.processKinesisEvent.bind(kh)
};
// // console.log("".concat(constants.MODULE, " - CONST: ").concat(JSON.stringify(constants, null, 2)));
// // console.log("".concat(constants.MODULE, " - ENV:   ").concat(JSON.stringify(process.env, null, 2)));


module.exports.processKinesisEvent({origin: TAJS_make('AnyStr'), data: {
  id: TAJS_make('AnyStr'),
  image: TAJS_make('AnyStr'),
  category: TAJS_make('AnyStr'),
  description: TAJS_make('AnyStr'),
  brand: TAJS_make('AnyStr'),
  name: TAJS_make('AnyStr')
}}, function(){});

