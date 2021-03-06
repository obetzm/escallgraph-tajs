'use strict';

var aws = require('aws-sdk'); // eslint-disable-line import/no-unresolved, import/no-extraneous-dependencies
var lambda = new aws.Lambda();

var KH = require('kinesis-handler');
/**
 * AJV Schemas
 */
// TODO Get these from a better place later


var eventSchema = {
      "$schema": "http://json-schema.org/schema#",
      "self": {
        "vendor": "com.nordstrom",
        "name": "retail-stream-egress",
        "format": "jsonschema",
        "version": "1-0-0"
      },
      "type": "object",
      "properties": {
        "schema":      { "type": "string" },
        "followsFrom": { "type": "string" },
        "origin":      { "type": "string" },
        "timeOrigin":  { "type": "string", "format": "date-time" },
        "data": {
          "type": "object",
          "properties": {
            "schema": { "type": "string" }
          },
          "required": [
            "schema"
          ],
          "additionalProperties": true
        },
        "eventId": { "type": "string" },
        "timeIngest":  { "type": "string", "format": "date-time" },
        "timeProcess": { "type": "string", "format": "date-time" }
      },
      "required": [
        "schema",
        "origin",
        "timeOrigin",
        "data",
        "eventId",
        "timeIngest",
        "timeProcess"
      ],
      "additionalProperties": false
    };

var updatePhoneSchema = {
      "$schema": "http://json-schema.org/schema#",
      "self": {
        "vendor": "com.nordstrom",
        "name": "user-info/update-phone",
        "format": "jsonschema",
        "version": "1-0-0"
      },
      "type": "object",
      "properties": {
        "schema":  { "type": "string" },
        "id": { "type": "string" },
        "phone":  { "type": "string" }
      },
      "required": [
        "schema",
        "id",
        "phone"
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

var constants = {
  // self
  MODULE: 'product-photos/0.processor/processor.js',
  // methods
  METHOD_START_EXECUTION: 'startExecution',
  // values
  ASSIGNMENTS_PER_REGISTRATION: 1,
  TTL_DELTA_IN_SECONDS: 60
  /* seconds per minute */
  * 60
  /* minutes per hour */
  * 2
  /* hours */
  ,
  // resources
  // STEP_FUNCTION: process.env.STEP_FUNCTION,
  TABLE_PHOTO_REGISTRATIONS_NAME: 'PHOTO_REGISTRATIONS_TABLE'
  /**
   * Transform record (which will be of the form in ingress schema) to the form of egress schema
   */

};

var transformer = function transformer(payload, record) {
  var result = Object.assign({}, payload);
  result.schema = 'com.nordstrom/retail-stream-egress/1-0-0';
  result.eventId = record.eventID;
  result.timeIngest = new Date(record.kinesis.approximateArrivalTimestamp * 1000).toISOString();
  result.timeProcess = new Date().toISOString();
  return result;
};
/**
 * Event Processor
 */


var kh = new KH.KinesisHandler(eventSchema, constants.MODULE, transformer);
/**
 * AWS
 */

var dynamo = new aws.DynamoDB.DocumentClient();
var impl = {
  /**
   * Parse the origin
   * @param origin
   * @return {*}
   */
  eventSource: function eventSource(origin) {
    var parts = origin.split('/');

    if (parts.length > 2) {
      return {
        uniqueId: parts[2],
        friendlyName: parts.length === 3 ? parts[2] : parts[3]
      };
    } else if (parts.length === 2) {
      return {
        uniqueId: parts[1],
        friendlyName: parts[1]
      };
    } else {
      return {
        uniqueId: 'UNKNOWN',
        friendlyName: 'UNKNOWN'
      };
    }
  },

  /**
   * Handle the given photographer registration message.  The impact of photographer registration is the immediate
   * allocation of a 3 image allowance (up to) with a TTL of roughly 2 hours (may vary).
   * @param event The event declaring the photographer registration action.  Example event:
   * {
   *   "schema": "com.nordstrom/retail-stream/1-0-0",
   *   "origin": "hello-retail/photographer-registration-automation",
   *   "timeOrigin": "2017-01-12T18:29:25.171Z",
   *   "data": {
   *     "schema": "com.nordstrom/user-info/update-phone/1-0-0",
   *     "id": "4579874",
   *     "phone": "1234567890"
   *   }
   * }
   * @param complete The callback with which to report any errors
   */
  registerPhotographer: function registerPhotographer(event, complete) {
    var updated = Date.now();
    var name = impl.eventSource(event.origin).friendlyName;
    var putParams = {
      TableName: constants.TABLE_PHOTO_REGISTRATIONS_NAME,
      ConditionExpression: 'attribute_not_exists(id)',
      Item: {
        id: event.data.id,
        name: name,
        created: updated,
        createdBy: event.origin,
        updated: updated,
        updatedBy: event.origin,
        phone: "+1".concat(event.data.phone),
        lastEvent: event.eventId,
        registrations: constants.ASSIGNMENTS_PER_REGISTRATION,
        assignments: 0,
        timeToLive: Math.ceil(updated / 1000
        /* milliseconds per second */
        ) + constants.TTL_DELTA_IN_SECONDS
      }
    };
    dynamo.put(putParams, function (err) {
      if (err) {
        if (err.code && err.code === 'ConditionalCheckFailedException') {
          var updateParams = {
            TableName: constants.TABLE_PHOTO_REGISTRATIONS_NAME,
            Key: {
              id: event.data.id // TODO the right thing?

            },
            ConditionExpression: '#le<:le',
            // update if this event has not yet caused an update
            UpdateExpression: ['set', '#c=if_not_exists(#c,:c),', '#cb=if_not_exists(#cb,:cb),', '#u=:u,', '#ub=:ub,', '#le=:le,', '#re=#re+:re,', '#as=if_not_exists(#as,:as),', '#tt=:tt'].join(' '),
            ExpressionAttributeNames: {
              '#c': 'created',
              '#cb': 'createdBy',
              '#u': 'updated',
              '#ub': 'updatedBy',
              '#le': 'lastEvent',
              '#re': 'registrations',
              '#as': 'assignments',
              '#tt': 'timeToLive' // TODO automated setup of TTL for table

            },
            ExpressionAttributeValues: {
              ':c': updated,
              ':cb': event.origin,
              ':u': updated,
              ':ub': event.origin,
              ':le': event.eventId,
              // TODO the right thing (this field is not currently available in event)
              ':re': constants.ASSIGNMENTS_PER_REGISTRATION,
              ':as': 0,
              ':tt': (Math.ceil(updated / 1000
              /* milliseconds per second */
              ) + constants.TTL_DELTA_IN_SECONDS).toString()
            },
            ReturnValues: 'NONE',
            ReturnConsumedCapacity: 'NONE',
            ReturnItemCollectionMetrics: 'NONE'
          };
          dynamo.update(updateParams, complete);
        } else {
          complete(err);
        }
      } else {
        complete();
      }
    });
  },

  /**
   * Start and execution corresponding to the given event.  Swallow errors that result from attempting to
   * create the execution beyond the first time.
   * @param event The event to validate and process with the appropriate logic.  Example event:
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
   * @param complete The callback with which to report any errors
   */
  startExecution: function startExecution(event, complete) {
    var sfEvent = event;
    sfEvent.merchantName = impl.eventSource(event.origin).friendlyName;
    var params = {
      FunctionName: 'assign-product-photos-dev-assign',
      InvocationType: "RequestResponse",
      Payload:  JSON.stringify(sfEvent)
    };
    lambda.invoke(params, function () {
        complete();
    });
  }
};
kh.registerSchemaMethodPair(updatePhoneSchema, impl.registerPhotographer);
kh.registerSchemaMethodPair(productCreateSchema, impl.startExecution);
module.exports = {
  processKinesisEvent: kh.processKinesisEvent.bind(kh)
};
// console.log("".concat(constants.MODULE, " - CONST: ").concat(JSON.stringify(constants, null, 2)));
// console.log("".concat(constants.MODULE, " - ENV:   ").concat(JSON.stringify(process.env, null, 2)));


module.exports.processKinesisEvent({
  origin: TAJS_make('AnyStr'),
  data: {
    id: TAJS_make('AnyStr'),
    phone: TAJS_make('AnyStr')
  },
  eventId: TAJS_make('AnyStr')}, function(){});