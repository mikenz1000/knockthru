// load the things we need
var mongoose = require('mongoose');

// define the schema for our user model
var taskSchema = mongoose.Schema({
    description : { type : String, required : true },
	done : { type : Boolean, default : false, required : true }
});

taskSchema.methods.upperCase = function(req,res,next)
{
    this.description = this.description.toUpperCase();
    var instance = this;
    this.save(function (err) {
        if (err) {
            return res.error(err);//res.status(400).send(err);
        }
        return res.redirect('/task.html?_id='+instance.id);
//        return res.status(204).send();
    });
}
taskSchema.methods.upperCase.isWebInvokable = true;

// create the model for users and expose it to our app
module.exports = mongoose.model('Task', taskSchema);