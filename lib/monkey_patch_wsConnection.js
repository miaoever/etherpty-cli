var Validation = require('../node_modules/websocket/lib/Validation').Validation;
var utils = require('../node_modules/websocket/lib/utils');
var debug = utils.debuglog('websocket');

const STATE_OPEN = "open";
const STATE_CLOSING = "closing";
const STATE_CLOSED = "closed";

var patch = {};

patch.CLOSE_REASON_NORMAL = 1000;
patch.CLOSE_REASON_GOING_AWAY = 1001;
patch.CLOSE_REASON_PROTOCOL_ERROR = 1002;
patch.CLOSE_REASON_UNPROCESSABLE_INPUT = 1003;
patch.CLOSE_REASON_RESERVED = 1004; // Reserved value.  Undefined meaning.
patch.CLOSE_REASON_NOT_PROVIDED = 1005; // Not to be used on the wire
patch.CLOSE_REASON_ABNORMAL = 1006; // Not to be used on the wire
patch.CLOSE_REASON_INVALID_DATA = 1007;
patch.CLOSE_REASON_POLICY_VIOLATION = 1008;
patch.CLOSE_REASON_MESSAGE_TOO_BIG = 1009;
patch.CLOSE_REASON_EXTENSION_REQUIRED = 1010;
patch.CLOSE_REASON_INTERNAL_SERVER_ERROR = 1011;
patch.CLOSE_REASON_TLS_HANDSHAKE_FAILED = 1015; // Not to be used on the wire

patch.CLOSE_DESCRIPTIONS = {
    1000: "Normal connection closure",
    1001: "Remote peer is going away",
    1002: "Protocol error",
    1003: "Unprocessable input",
    1004: "Reserved",
    1005: "Reason not provided",
    1006: "Abnormal closure, no further detail available",
    1007: "Invalid data received",
    1008: "Policy violation",
    1009: "Message too big",
    1010: "Extension requested by client is required",
    1011: "Internal Server Error",
    1015: "TLS Handshake Failed"
};

patch.sendMessage = function(message) {
  this.sendUTF(JSON.stringify(message));
}

patch.processFrame = function(frame) {
  var WebSocketConnection = this;
  var i;
  var message;

  // Any non-control opcode besides 0x00 (continuation) received in the
  // middle of a fragmented message is illegal.
  if (this.frameQueue.length !== 0 && (frame.opcode > 0x00 && frame.opcode < 0x08)) {
    this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
              "Illegal frame opcode 0x" + frame.opcode.toString(16) + " " +
                "received in middle of fragmented message.");
              return;
  }

  switch(frame.opcode) {
    case 0x02: // WebSocketFrame.BINARY_FRAME
      if (this.assembleFragments) {
      if (frame.fin) {
        // Complete single-frame message received
        this.emit('message', {
          type: 'binary',
          binaryData: frame.binaryPayload
        });
      }
      else {
        // beginning of a fragmented message
        this.frameQueue.push(frame);
        this.fragmentationSize = frame.length;
      }
    }
    break;
    case 0x01: // WebSocketFrame.TEXT_FRAME
      if (this.assembleFragments) {
      if (frame.fin) {
        if (!Validation.isValidUTF8(frame.binaryPayload)) {
          this.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA,
                    "Invalid UTF-8 Data Received");
                    return;
        }
        // Complete single-frame message received
        this.emit('message', {
          type: 'utf8',
          utf8Data: frame.binaryPayload.toString('utf8')
        });
        var data = frame.binaryPayload.toString('utf8');
        try {
          var msg = JSON.parse(data);
        } catch(_err) {
          break;
        }
        if (msg) {
          var msgType = msg.type;
          delete msg.type;
          msg["channel"] = this.type || undefined;
          this.emit(msgType, msg);
        }
      }
      else {
        // beginning of a fragmented message
        this.frameQueue.push(frame);
        this.fragmentationSize = frame.length;
      }
    }
    break;
    case 0x00: // WebSocketFrame.CONTINUATION
      if (this.assembleFragments) {
      if (this.frameQueue.length === 0) {
        this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
                  "Unexpected Continuation Frame");
                  return;
      }

      this.fragmentationSize += frame.length;

      if (this.fragmentationSize > this.maxReceivedMessageSize) {
        this.drop(WebSocketConnection.CLOSE_REASON_MESSAGE_TOO_BIG,
                  "Maximum message size exceeded.");
                  return;
      }

      this.frameQueue.push(frame);

      if (frame.fin) {
        // end of fragmented message, so we process the whole
        // message now.  We also have to decode the utf-8 data
        // for text frames after combining all the fragments.
        var bytesCopied = 0;
        var binaryPayload = new Buffer(this.fragmentationSize);
        var opcode = this.frameQueue[0].opcode;
        this.frameQueue.forEach(function (currentFrame) {
          currentFrame.binaryPayload.copy(binaryPayload, bytesCopied);
          bytesCopied += currentFrame.binaryPayload.length;
        });
        this.frameQueue = [];
        this.fragmentationSize = 0;

        switch (opcode) {
          case 0x02: // WebSocketOpcode.BINARY_FRAME
            this.emit('message', {
            type: 'binary',
            binaryData: binaryPayload
          });
          break;
          case 0x01: // WebSocketOpcode.TEXT_FRAME
            if (!Validation.isValidUTF8(binaryPayload)) {
            this.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA,
                      "Invalid UTF-8 Data Received");
                      return;
          }
          this.emit('message', {
            type: 'utf8',
            utf8Data: binaryPayload.toString('utf8')
          });
          var data = binaryPayload.toString('utf8');
          console.log(data);
          try {
            var msg = JSON.parse(data);
          } catch(_err) {
            break;
          }
          if (msg) {
            var msgType = msg.type;
            delete msg.type;
            msg["channel"] = this.type || undefined;
            this.emit(msgType, msg);
          }
          
          break;
          default:
            this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
                      "Unexpected first opcode in fragmentation sequence: 0x" + opcode.toString(16));
                      return;
        }
      }
    }
    break;
    case 0x09: // WebSocketFrame.PING
      this.pong(frame.binaryPayload);
    break;
    case 0x0A: // WebSocketFrame.PONG
      break;
    case 0x08: // WebSocketFrame.CONNECTION_CLOSE
      debug("Received close frame");
    // FIXME: When possible, use return statements, not else blocks
    if (this.waitingForCloseResponse) {
      // Got response to our request to close the connection.
      // Close is complete, so we just hang up.
      debug("Got close response from peer.  Close sequence complete.");
      this.clearCloseTimer();
      this.waitingForCloseResponse = false;
      this.state = STATE_CLOSED;
      this.socket.end();
    }
    else {
      // Got request from other party to close connection.
      // Send back acknowledgement and then hang up.
      this.state = STATE_CLOSING;
      var respondCloseReasonCode;

      // Make sure the close reason provided is legal according to
      // the protocol spec.  Providing no close status is legal.
      // WebSocketFrame sets closeStatus to -1 by default, so if it
      // is still -1, then no status was provided.
      if (frame.invalidCloseFrameLength) {
        this.closeReasonCode = 1005; // 1005 = No reason provided.
        respondCloseReasonCode = WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR;
      }
      else if (frame.closeStatus === -1 || validateReceivedCloseReason(frame.closeStatus)) {
        this.closeReasonCode = frame.closeStatus;
        respondCloseReasonCode = WebSocketConnection.CLOSE_REASON_NORMAL;
      }
      else {
        this.closeReasonCode = frame.closeStatus;
        respondCloseReasonCode = WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR;
      }

      // If there is a textual description in the close frame, extract it.
      if (frame.binaryPayload.length > 1) {
        if (!Validation.isValidUTF8(frame.binaryPayload)) {
          this.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA,
                    "Invalid UTF-8 Data Received");
                    return;
        }
        this.closeDescription = frame.binaryPayload.toString('utf8');
      }
      else {
        this.closeDescription = WebSocketConnection.CLOSE_DESCRIPTIONS[this.closeReasonCode];
      }
      debug(
        "Remote peer %s requested disconnect, code: %d - %s - close frame payload length: %d",
        this.remoteAddress, this.closeReasonCode,
        this.closeDescription, frame.length
      );
      this.sendCloseFrame(respondCloseReasonCode, null, true);
      this.socket.end();
      this.connected = false;
    }
    break;
    default:
      this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
                "Unrecognized Opcode: 0x" + frame.opcode.toString(16));
                break;
  }
};

function validateReceivedCloseReason(code) {
  if (code < 1000) {
    // Status codes in the range 0-999 are not used
    return false;
  }
  if (code >= 1000 && code <= 2999) {
    // Codes from 1000 - 2999 are reserved for use by the protocol.  Only
    // a few codes are defined, all others are currently illegal.
    return [1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011].indexOf(code) !== -1
  }
  if (code >= 3000 && code <= 3999) {
    // Reserved for use by libraries, frameworks, and applications.
    // Should be registered with IANA.  Interpretation of these codes is
    // undefined by the WebSocket protocol.
    return true;
  }
  if (code >= 4000 && code <= 4999) {
    // Reserved for private use.  Interpretation of these codes is
    // undefined by the WebSocket protocol.
    return true;
  }
  if (code >= 5000) {
    return false;
  }
}

module.exports = function(connection, type) {
  var proto = connection.__proto__;
  patch.__proto__ = proto;
  connection.__proto__ = patch;
  connection.type = type || "global";

  return connection;
}
