const express = require("express");
const router = express.Router();
// const validateRegisterInput = require('../../validation/register');
const validateLoginInput = require('../../validation/login');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Filling = require('../../models/Filling');
const jwt = require('jsonwebtoken');
const keys = require('../../config/keys');
const passport = require('passport');
const uuid = require('uuid');
const Validator = require('validator');
const passwordValidator = require('password-validator');


const multer = require("multer");
const AWS = require("aws-sdk");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

AWS.config.update({
    accessKeyId: keys.awsBucketAccessId,
    secretAccessKey: keys.awsBucketToken,
    region: keys.awsRegion
});



module.exports = (options) => {

    router.post('/addBottle', passport.authenticate('jwt', { session: false }), (req, res) => {
        if (options.adding === true){
            return res.status(400).json({message: "someone else is already adding their bottle"})
        }
        options.curAdding = req.user._id;
        options.adding = true;
        setTimeout(function() { 
            options.adding = false;
            options.curAdding = null;
        }, 10000);
        return res.json({message: 'you have 10 seconds to add your water bottle.'})
    });
    router.get('/fills', passport.authenticate('jwt', { session: false }), async (req, res) => {
        const fills = await Filling.find({
            user: req.user._id
        })
        console.log(fills);
        return res.json({fills});
    });


    router.post('/register', (req, res) => {

        const newUser = new User({
            username: req.body.username,
            email: req.body.email,
            password: req.body.password,
            sex: req.body.sex,
            avatarUrl: ""
        });

        let errors = {};
        const passwordSchema = new passwordValidator();
        passwordSchema
            .is().min(8)
            .is().max(75)
            .has().uppercase()
            .has().lowercase()
            .has().digits()
            .has().not().spaces()



        let validatorErrors = newUser.validateSync();
        if (validatorErrors) {

            errors = Object.assign(validatorErrors.errors, errors)
        }
        if (!Validator.isEmail(req.body.email)) {
            errors.email = {
                message: "Invalid Email",
                name: "ValidatorError",
                properties: {
                    message: "Path `email` must be a valid email.",
                    type: "not valid",
                    path: "email"
                },
                kind: "not valid",
                path: "email"
            };
        }
        if (req.body.password !== req.body.password2) errors.password2 = {
            message: "Password Confirmation must match",
            name: "ValidatorError",
            properties: {
                message: "Path `password2` must match path `password`.",
                type: "required",
                path: "password2"
            },
            kind: "required",
            path: "password2"
        };
        const passValid = passwordSchema.validate(req.body.password, { list: true });
        if (passValid.length) {
            errors.password = {
                message: 'Path `password` must have at least 1 number, 8 chars, and one capital letter.',
                name: 'ValidatorError',
                properties: {
                    message: "Path `password` must have at least 1 number, 8 chars, and one capital letter.",
                    type: "not valid",
                    path: "password"
                }
            };
        }

        if (Object.keys(errors).length !== 0) return res.status(422).json(errors)
        bcrypt.genSalt(10, (err, salt) => {
            bcrypt.hash(newUser.password, salt, (err, hash) => {
                if (err) throw err;
                newUser.password = hash;
                newUser.save()
                    .then(user => {
                        let payload = Object.assign({}, user.toObject());
                        delete payload.password;
                        delete payload.date;

                        jwt.sign(
                            payload,
                            keys.secretOrKey,
                            // Tell the key to expire in one hour
                            { expiresIn: 604_800 },
                            (err, token) => {
                                res.json({
                                    success: true,
                                    token: 'Bearer ' + token,
                                });
                            });
                    })

                    .catch(err => res.status(400).json(err.errors));
            })
        })
        // }
    })
    router.post('/login', (req, res) => {
        const { errors, isValid } = validateLoginInput(req.body);
        const username = req.body.username;
        const password = req.body.password;
        if (!isValid) {
            return res.status(400).json(errors);
        }
        User.findOne({ username: new RegExp(`^${username}$`, 'i') })
            .then(user => {
                if (!user) {
                    console.log('hitting')
                    // Use the validations to send the error
                    errors.username = 'User not found';
                    return res.status(400).json(errors);
                };
                bcrypt.compare(password, user.password)
                    .then(async isMatch => {
                        if (isMatch) {
                            let newUser = Object.assign({}, user.toObject());
                            delete newUser.password;
                            delete newUser.date;
                            const payload = newUser;
                            jwt.sign(
                                payload,
                                keys.secretOrKey,
                                // Tell the key to expire in one hour
                                { expiresIn: 604_800 },
                                (err, token) => {
                                    if (err) {
                                        return res.status(400).json(errors);
                                    }
                                    return res.json({
                                        success: true,
                                        token: 'Bearer ' + token
                                    });
                                });
                        } else {
                            // And here:
                            return res.status(400).json({ password: 'Invalid credentials' });
                        }
                    })
            })
    });
    return router;
} 