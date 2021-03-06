var crudlet     = require("../..");
var caplet      = require("caplet");
var localstore  = require("crudlet-local-storage");
var pubnub      = require("crudlet-pubnub");
var React       = require("react");
var _           = require("highland");

var localdb = localstore();
var pubdb   = pubnub({
  publishKey: "pub-c-ca2119a6-a6a6-4374-8020-c94f5e439d77",
  subscribeKey: "sub-c-5bbdee5e-d560-11e4-b585-0619f8945a4f"
});

pubdb.addChannel("chatroom");

var db = crudlet.tailable(crudlet.parallel(localdb, pubdb));

// pipe all pubnub operations back into the database
pubdb("tail").pipe(crudlet.open(db));

var messagesDb = crudlet.child(db, { collection: "messages" });

/**
 */

var Message = caplet.createModelClass({
  getInitialProperties: function() {
    return {
      uid: String(Date.now()) + "_" + Math.round(Math.random() * 999999999)
    };
  },
  initialize: function() {
    this.opStream = crudlet.open(messagesDb).on("data", this.set.bind(this, "data"));
  },
  remove: function() {
    this.opStream.
    write(crudlet.operation("remove", { query: { uid: this.uid } }));
    this.dispose();
  },
  save: function() {
    this.opStream.
    write(crudlet.operation("upsert", { query: { uid: this.uid }, data: this.toData() }));
  },
  toData: function() {
    return {
      uid  : this.uid,
      text : this.text
    };
  }
});

/**
 */

var Messages = caplet.createCollectionClass({
  modelClass: Message,
  initialize: function() {
    messagesDb("tail").on("data", this.load.bind(this));
  },
  addMessage: function(properties) {
    var m = this.createModel(properties);
    this.push(m);
    m.save();
    return m;
  },
  load: function() {
    // messagesDb("load", { multi: true }).pipe(_().collect().map(createModel(Message, "uid")))
    messagesDb("load", { multi: true }).pipe(_().collect()).on("data", this.set.bind(this, "data"));
    return this;
  }
});

/**
 */

var MessageView = React.createClass({
  mixins: [caplet.watchModelsMixin],
  removeMessage: function() {
    this.props.message.remove();
  },
  render: function() {
    return React.createElement("li", null,
      this.props.message.uid,
      this.props.message.text,
      " ",
      React.createElement("a", { href: "#", onClick: this.removeMessage}, "x")
    );
  }
});

/**
 */

var MessagesView = React.createClass({
  mixins: [caplet.watchModelsMixin],
  onKeyDown: function(event) {
    if (event.keyCode !== 13) return;
    var input = this.refs.input.getDOMNode();
    this.props.messages.addMessage({
      text: input.value
    });
    input.value = "";
  },
  render: function() {
    return React.createElement("div", null,
      React.createElement("input", { ref: "input", placeholder: "Message", onKeyDown: this.onKeyDown }),
      React.createElement("ul", null,
        this.props.messages.map(function(message) {
          return React.createElement(MessageView, { message: message })
        })
      )
    )
  }
});

/**
 */

React.render(React.createElement(MessagesView, {
  messages: global.messages = Messages().load()
}), document.body);
