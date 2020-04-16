const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const uniqueValidator = require('mongoose-beautiful-unique-validation');
const BottleSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "User"
    },
    uuid: {
        type: String,
        required: true,
        unique: true
    },
    dateAdded: {
        type: Date,
        default: Date.now
    }
})
BottleSchema.plugin(uniqueValidator);

module.exports = Bottle = mongoose.model('Bottle', BottleSchema);