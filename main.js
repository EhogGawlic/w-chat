const express = require('express')
const app = express()
const port = 3000
const ejs = require('ejs')

const jwt = require('jsonwebtoken')
const bodyParser = require('body-parser')
const {MongoClient} = require('mongodb')
const dotenv = require('dotenv')
const bcrypt = require('bcrypt')
dotenv.config()
const uri = process.env.PASSWORD;
const client = new MongoClient(uri);
const cookieParser = require('cookie-parser')
app.use(cookieParser())

async function initMongo(){
	try{
		await client.connect()
		console.log("Connected to MongoDB")
	} catch (e) {
		console.error(e)
	}
}
initMongo().catch(console.error)




function formatData(post,i){
    return `
    <div class="post" id="${i}">
        <h2>${post.title}</h2>
        <p>by ${post.author.dname} ${post.author.status}</p><br>
        <p>${post.content}</p>
    </div>
    `
}

async function getAllData(collection){
    const db = client.db('wchat')
    const coll = db.collection(collection)
    const data = await coll.find({}).toArray()
    return data
}
async function addData(collection, data){
    const db = client.db('wchat')
    const coll = db.collection(collection)
    const result = await coll.insertOne(data)
    return result
}
async function getOneData(collection, query){
    const db = client.db('wchat')
    const coll = db.collection(collection)
    const data = await coll.find(query).next()
    return data
}
async function deleteData(collection, query){
    const db = client.db('wchat')
    const coll = db.collection(collection)
    const result = await coll.deleteOne(query)
    
}
async function updateData(collection, query, data){
	const db = client.db('wchat')
	const coll = db.collection(collection)
	const result = coll.updateOne(query, {$set: data})
}
async function encryptPassword(password){
    const saltRounds = 10;
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(password, saltRounds);
    return hash
}
async function comparePassword(password, hash){
    const bcrypt = require('bcrypt');
    const result = await bcrypt.compare(password, hash);
    return result
}
async function generateAccessToken(username){
    return jwt.sign({username}, process.env.SECRET, {expiresIn: '1800s'})
}
async function verifyToken(token){
    try{
        const decoded = jwt.verify(token, process.env.SECRET)

        return decoded
    } catch (e) {
        return null
    }
}



app.use(express.static(__dirname+ '\\'))
app.use(bodyParser.urlencoded({extended: true}))

app.get('/', async (req, res) => {
    let user = null
    if (req.cookies.token) {
        user = await verifyToken(req.cookies.token)
    }
    let postAll = ``
    let contacts = ``
    const posts = await getAllData('posts')
    const tusr = user?await getOneData('users', {username: user.username}):null
	if (tusr && tusr.contacts){
    const cntcts = tusr?tusr.contacts:[]
	    console.log(cntcts)
	    cntcts.forEach(c => {
	        console.log(c)
	        contacts += `<p class="contact">${c.charAt(0)}</p><br>`
	    })
	}
    let i = 0
    posts.forEach(post => {
        postAll += formatData(post,i)+"<br>"
        i++
    })
    res.render('index', {posts: postAll, loggedin: user?true:false, usr: user?user.username:null,contacts})
})
app.get('/chatjoin', (req, res) => {
    res.render('chatjoin')
})
app.get('/signin', (req, res) => {
    res.render('signin')
})
app.post('/signedin', async (req, res) => {
    const username = req.body.username
    const password = req.body.password
    const usr = await getOneData('users', {username: username})
    if(!usr){
        res.send("Username not found<button onclick='history.back()'>Go Back</button>")
        return
    }
    const match = await comparePassword(password, usr.password)
    if(!match){
        res.send("Incorrect password<button onclick='history.back()'>Go Back</button>")
        return
    }
    res.cookie('token', await generateAccessToken(username), {httpOnly: true,maxAge: 1800 * 1000 })
    res.redirect('/')
})
app.post('/signedup', async (req, res) => {
    console.log(req.body)
    const username = req.body.username
    const usr = await getOneData('users', {username: username})
    if(usr){
        res.send("Username already taken<button onclick='history.back()'>Go Back</button>")
        return
    }
    const email = req.body.email
    const password = req.body.password
    const hash = await encryptPassword(password)
    const user = {
        username: username,
        email: email,
        password: hash,
        dname: username,
        status: "",
		contacts:[]
    }
    const result = await addData('users', user)
    res.cookie('token', await generateAccessToken(username), {httpOnly: true,maxAge: 1800 * 1000 })
    res.redirect('/')
})
app.get('/post',(req, res) => {
    res.render('post')
})
app.post('/posted', async (req, res) => {
    if(!req.cookies.token){
        res.send("no bad boi<button onclick='history.back()'>Go Back</button>")
    }
    const user = await verifyToken(req.cookies.token)
    if(!user){
        res.send("no bad boi<button onclick='history.back()'>Go Back</button>")
    }
    const usr = await getOneData('users', {username: user.username})
    if(!usr){
        res.send("no bad boi<button onclick='history.back()'>Go Back</button>")
    }
    await addData('posts', {
        title: req.body.title,
        content: req.body.content,
        author: {
            dname: usr.dname,
            status: usr.status,
            username: usr.username
        }
    })
    res.redirect('/')
})//
app.post('/delete', async (req, res) => {
    if(!req.cookies.token){
        res.send("no bad boi<button onclick='history.back()'>Go Back</button>")
    }
    const user = await verifyToken(req.cookies.token)
    if(!user){
        res.send("Expired login<button onclick='history.back()'>Go Back</button>")
    }
    const usr = await getOneData('users', {username: user.username})
    const posts = await getAllData('posts')
    const post = posts[req.body.i]
    if (usr.username == post.author.username || usr.status == "<span class=\"red\">[MOD]</span>") {
        await deleteData('posts', post)
        res.send("Post deleted<button onclick='window.location=\"/\"'>OK</button>")
    } else {
        res.send("You don't have permission to delete this post<button onclick='history.back()'>Go Back</button>")
    }
})
app.get('/post:id=:id', async (req, res) => {
    const id = parseInt(req.params.id)
    console.log("id"+id)
    const posts = await getAllData('posts')
    
    const post = posts[id]
    console.log(post)
    if(!post){
        res.send("Wait, how did you find this <button onclick='history.back()'>Go Back</button>")
        return
    }
    const data =  `
    <div id="bigpost" id="${id}">
        <h2>${post.title}</h2>
        <p>by ${post.author.dname} ${post.author.status}</p><br>
        <p>${post.content}</p>
        <form action="/delete" method="post">
            <input type="number" class="hidden" name="i" value="${id}">
            <button type="submit">Delete post (only if this is your post or you're a moderator)</button>
        </form>
    </div>
    `
    res.render('singlepost', {post: data})
})
app.get('/user:name=:name', async (req, res) => {
    const name = req.params.name
    const user = await getOneData("users", {username:name})
    if(!user){
        res.send("Invalid user <button onclick='history.back()'>Go Back</button>")
        return
    }
    const data =  `
    <div id="bigpost">
        <h2>${user.dname}</h2>
        <p>${user.status}</p>
        <form action="/ban" method="post">
            <input type="number" class="hidden" name="username" value="${name}">
            <button type="submit">Ban user (only if you're a moderator)</button>
        </form>
    </div>
    `
    res.render('singlepost', {post: data})
})
app.post('/ban', async(req, res)=>{
	if (!req.cookies.token){
		res.send("You are not logged in")
	}
	const username = req.body.username
	const user = await getOneData("users", {username})
	const cookieToken = await verifyToken(req.cookies.token)
	const tuser = await getOneData("users", {username:cookieToken.username})
	if (!tuser){
		res.send("You are not logged in")
	}
	if (tuser.status != '<span class="red">[MOD]</span>'){
		res.send("You are not authorized to ban people")
	}
	if (user.status == '<span class="red">[MOD]</span>'){
		res.send("You can not ban mods.")
	}
	updateOne('users', {username:user.username}, {status: '(Banned)'})
	res.send('yay')
})
app.engine('html', require('ejs').renderFile)
app.set('view engine', 'ejs')
app.set('views', __dirname)


app.listen(port, () => {
  console.log(`App listening on port ${port}`)
})//







