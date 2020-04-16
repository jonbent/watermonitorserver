const SerialPort = require('serialport');
const http = require('http');
const Readline = require('@serialport/parser-readline');
const path = require('path');
const mongoose = require('mongoose');
const express = require("express");
const bodyParser = require('body-parser');
const passport = require('passport');
const Bottle = require('./models/Bottle');
const User = require('./models/User');
const Filling = require('./models/Filling');
const SocketIO = require('socket.io')
const keys = require('./config/keys');
// if (!String.prototype.trim) {
//     String.prototype.trim = function () {
//         return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
//     };
// }
const StatsD = require('node-dogstatsd').StatsD

const dogstatsd = new StatsD('127.0.0.1', 8125);
// dogstatsOptions = {
//     'statsd_host': '127.0.0.1',
//     'statsd_port': 8125
// }
const options = {
    adding: false,
    curAdding: null
};

const users = require("./routes/api/users")(options);

// const db = "mongodb://localhost:27017/waterMonitorDB";
const db = keys.mongoURI;
const devicePath = keys.devicePath;
const cors = require('cors');

const app = express();
const server = http.createServer(app)
const io = SocketIO(server)

app.use(cors());

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(passport.initialize());
require('./config/passport')(passport);

const port = process.env.PORT || 5000;

app.use("/api/users", users);

const serialPort = new SerialPort(devicePath, {
    baudRate: 9600
});
const parser = serialPort.pipe(new Readline({ delimiter: '\n' }));

let timeStartedAdding;
const readCards = async (data) => {
    const arduinoResponse = data.split(": ");
    if (arduinoResponse[0] === "start reading card") {
        // dogstatsd.event('Filling Started', `bottle uuid: ${arduinoResponse[1]} started filling`, {alertType: "info"}, {tags: ["app:waterMonitor"]})
        timeStartedAdding = new Date().getTime();
    } else if (arduinoResponse[0] === "stop reading card") {
        arduinoResponse[1] = arduinoResponse[1].trim();
        const secondsFilled = Math.round((new Date().getTime() - timeStartedAdding) / 1000);
        // dogstatsd.event('Filling Stopped', `bottle uuid: ${arduinoResponse[1]} stopped filling after ${secondsFilled} seconds`, { alertType: "info" }, { tags: ["app:waterMonitor"] })
        const foundBottle = await Bottle.findOne({ uuid: arduinoResponse[1] })
        if (foundBottle) {
            User.findOne({_id: foundBottle.user}).then((user) => {
                dogstatsd.increment('waterMonitor.userFills', ["app:waterMonitor", `user:${user.username}`] );
                dogstatsd.increment('waterMonitor.fills', ["app:waterMonitor"])
                dogstatsd.histogram("waterMonitor.fillSeconds", secondsFilled, ["app:waterMonitor"])
            });

            const newFill = new Filling({
                bottle: foundBottle._id,
                fillTime: secondsFilled,
                user: foundBottle.user
            })
            newFill.save().then(res => console.log(res)).catch(err => console.log(err));
        }
        console.log(foundBottle);
    }
};

const waitForRemoval = (data) => {
    if (data.slice(0, 17) === "stop reading card") {
        parser.removeListener('data', waitForRemoval);
        parser.addListener('data', readCards);
    }
}
io.on('connection', socket => {
    socket.on('addBottle', async function (userId) {
        console.log("trying to add bottle")
        options.adding = true;
        options.curAdding = userId;
        // socket.emit('startedAdding');
        parser.removeListener('data', readCards);
        const tenSecTimeout = setTimeout(() => {
            parser.removeListener('data', addBottle);
            parser.addListener('data', readCards);
        }, 10000);
        const addBottle = (data) => {
            const arduinoResponse = data.split(": ");
            if (options.adding && arduinoResponse[0] === "start reading card") {
                arduinoResponse[1] = arduinoResponse[1].trim();
                Bottle.findOne({uuid: arduinoResponse[1]})
                    .then(foundBottle => {
                        if (foundBottle){
                            socket.emit("addingFailed", { message: " failed adding the bottle" });
                            parser.removeListener('data', addBottle);
                            parser.addListener('data', waitForRemoval);
                        } else {
                            const newBottle = new Bottle({
                                user: options.curAdding,
                                uuid: arduinoResponse[1]
                            })
                            const confirmListener = () => {
                                newBottle.save().then(bottle => {
                                    clearTimeout(tenSecTimeout);
                                    socket.emit("addedBottle", { ...bottle });
                                    socket.removeListener("confirmAddBottle", confirmListener);
                                    parser.removeListener('data', addBottle);
                                    parser.addListener('data', waitForRemoval)
                                }).catch(() => {
                                    clearTimeout(tenSecTimeout);
                                    socket.emit("addingFailed", { message: " failed adding the bottle" });
                                    socket.removeListener("confirmAddBottle", confirmListener);
                                    parser.removeListener('data', addBottle);
                                    parser.addListener('data', waitForRemoval)
                                })
                            }
                            socket.emit('askForBottleConfirmation', newBottle)
                            socket.on('confirmAddBottle', confirmListener)
                        }
                    })
            }
        };
        parser.on('data', addBottle)
    })
    
    socket.on("startPullingBottles", async (userId) => {
        const bottles = await Bottle.find({user: userId});
        socket.emit("pullBottles", bottles);
    })
    socket.on('disconnect', () => {
        console.log('user disconnected')
    })
    
})


// serialPort.on('readable', function () {
//     console.log('Data:', serialPort.read());
// });
if (process.env.NODE_ENV === 'production') {
    app.use(express.static('frontend/build'));
    app.get('/', (req, res) => {
        res.sendFile(path.resolve(__dirname, 'frontend', 'build', 'index.html'));
    })
}




server.listen(port, () => {
    parser.on('data', readCards);
    mongoose.connect(db, { useUnifiedTopology: true, useNewUrlParser: true, })
        .then(() => console.log("Connected to MongoDB successfully"))
        .catch(err => console.log(err));

});
