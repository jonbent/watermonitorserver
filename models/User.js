const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const uniqueValidator = require('mongoose-beautiful-unique-validation');

const UserSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        uniqueCaseInsensitive: true

    },
    email: {
        type: String,
        required: true,
        unique: true,
        uniqueCaseInsensitive: true
    },
    password: {
        type: String,
        required: true
    },
    avatarUrl: {
        type: String
    },
    dateCreated: {
        type: Date,
        default: Date.now
    }
})
UserSchema.plugin(uniqueValidator);

module.exports = User = mongoose.model('User', UserSchema);