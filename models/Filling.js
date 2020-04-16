const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const uniqueValidator = require('mongoose-beautiful-unique-validation');
const FillingSchema = new Schema({
    bottle: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "Bottle"
    },
    user: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "Bottle"
    },
    fillTime: {
        type: Number,
        required: true
    },
    fillingStarted: {
        type: Date,
        default: Date.now
    }
})
FillingSchema.plugin(uniqueValidator);

module.exports = Bottle = mongoose.model('Filling', FillingSchema);