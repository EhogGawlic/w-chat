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
		<p>${post.replies ? "Has replies" : ""}</p>
    </div>
    `
}
function formatReplies(replies){
    let formatted = '<div class="replies"><h3>Replies:</h3>'
    replies.forEach(reply => {
        console.log(reply)
        formatted += `
        <div class="reply">
            <b>${reply.title}</b><br>
            <b>${reply.author.dname} ${reply.author.status}</b><br>
            <p>${reply.content}</p>
        </div><br>`
    })
    return formatted + '</div>'
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
    let notice = await getOneData('notices',{})
    if (!notice){
        await addData('notices', {title:"Notice",content:"Important stuf will be here"})
    }
    
    notice = await getOneData('notices',{})
    postAll += `<div class="post">${notice.title}<br>${notice.content}</div><br>`
	if (tusr && tusr.contacts){
    const cntcts = tusr?tusr.contacts:[]
	    console.log(cntcts)
	    cntcts.forEach(c => {
	        console.log(c)
	        contacts += `<p class="contact">${c.charAt(0)}</p><br>`
	    })
	}
    for (let i = posts.length - 1; i >= 0; i--) {
        postAll += formatData(posts[i],i)+"<br>"
    }
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
    if (usr.status == "(Banned)"){
        res.send("You are banned from this site :( <button onclick='history.back()'>Go Back</button>")
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
    if (req.body.content.includes("<iframe")){
        res.send('Cannot include iframes because that crashes it for some reason :( <button onclick="history.back()">Go Back</button>')
        return
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
        <p>${post.replies ? formatReplies(post.replies) : ""}<button onclick="window.location='/reply:post=${id}'">Reply</button></p>
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
	
	const token = await verifyToken(req.cookies.token)
	if (token){
		const tuser = await getOneData("users",{username:token.username})
		if (!tuser){
			res.send("eee")
			return
		}
		if (tuser.username != user.username){
			
		    const data =  `
		    <div id="bigpost">
		        <h2>${user.dname}</h2>
				<h3>${user.username}</h3>
		        <p>${user.status}</p>
		        <form action="/ban" method="post">
		            <input type="text" class="hidden" name="username" value='${user.username}'>
		            <button type="submit">Ban user (only if you're a moderator)</button>
		        </form>
		    </div>
		    `
		    res.render('singlepost', {post: data})
			return
		}
		const data =  `
	    <div id="bigpost">
	 <form action="/changedname" method="post">
	        <h2><input value='${user.dname}' id="dninp"type="text"name="dname"></h2>
		 
	            <input type="text" class="hidden" name="username" value='${user.username}'>
		 	<button type="submit">Change</button><br>
		 </form>
			<h3>${user.username}</h3>
	        <p>${user.status}</p>
	        <form action="/ban" method="post">
	            <input type="text" class="hidden" name="username" value='${user.username}'>
	            <button type="submit">Ban user (only if you're a moderator)</button>
	        </form>
	    </div>
        <script>
            document.getElementById("dninp").onchange = function() {
                if (this.value.contains("\\'")){
                alert("Display name cannot contain single quotes")
                    document.querySelector("button[type='submit']").disabled = true
                } else {
                    document.querySelector("button[type='submit']").disabled = false
                }
            }
        </script>
	    `
	    res.render('singlepost', {post: data})
		return
	}
    const data =  `
    <div id="bigpost">
        <h2>${user.dname}</h2>
		<h3>${user.username}</h3>
        <p>${user.status}</p>
        <form action="/ban" method="post">
            <input type="text" class="hidden" name="username" value='${user.username}'>
            <button type="submit">Ban user (only if you're a moderator)</button>
        </form>
    </div>
    `
    res.render('singlepost', {post: data})
})
app.post('/changedname', async(req,res)=>{
	const user = await getOneData("users", {username:req.body.username})
	if (!user){
		res.send("No user found")
		return
	}
	user.dname = req.body.dname
	
    
	await updateData('users', {username:req.body.username}, {dname:user.dname})
	res.redirect("/")
})
app.post('/ban', async(req, res)=>{
	if (!req.cookies.token){
		res.send("You are not logged in")
	}
    console.log(req.body)
	const username = req.body.username
    console.log(username)
	const user = await getOneData("users", {username})
	//if (!user){
	//	res.send("Invalid user")
	//}
	console.log(user)
	const cookieToken = await verifyToken(req.cookies.token)
	const tuser = await getOneData("users", {username:cookieToken.username})
	if (!tuser){
		res.send("You are not logged in")
		return
	}
	if (tuser.status != '<span class="red">[MOD]</span>'){
		res.send("You really though, huh?")
		return
	}
	if (user.status == '<span class="red">[MOD]</span>'){
		res.send("You really though, huh?")
		return
	}
	updateData('users', {username}, {status: '(Banned)'})
	res.send('yay')
})
app.get('/reply:post=:id', async (req, res) => {
    res.render('reply', {id: req.params.id})
})
app.post('/replied', async (req, res) => {
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
    const posts = await getAllData('posts')
    const post = posts[req.body.id]
    if(!post){
        res.send("Wait, how did you find this <button onclick='history.back()'>Go Back</button>")
        return
    }
    if (!post.replies) {
        updateData("posts", {_id: post._id}, {replies: []})
    }
    post.replies = post.replies ? post.replies : []
    const reply = {
        content: req.body.content,
        title: req.body.title,
        
        author: {
            dname: usr.dname,
            status: usr.status,
            username: usr.username
        }
    }
    console.log(post.replies)
    post.replies.push(reply)
    await updateData("posts", {_id: post._id}, {replies: post.replies})
    res.redirect('/post:id='+req.body.id)
})
app.get('/terms', (req, res) => {
    res.render('terms')
})
app.get('/admin', async (req, res) => {
    if (!req.cookies.token) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    const token = await verifyToken(req.cookies.token)
    if (!token) {
        res.send("Expired login <button onclick='history.back()'>Go Back</button>")
        return
    }
    const user = await getOneData('users', {username: token.username})
    if (!user) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    if (user.username != "ehogin"){
        res.send("You are not authorized to view this page <button onclick='history.back()'>Go Back</button>")
    }
    const users = await getAllData('users')
    const usrlist = users.map(u => {
        return `<p><form action='/admin' method='post'>${u.dname} (<input type="text" value='${u.username}' name="username">) - ${u.status} <button type="submit">Promote</button></form></p>`
    })
    res.render('admin', {users: usrlist.join('')})
})
app.get('/admin/ban', async (req, res) => {
    if (!req.cookies.token) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    const token = await verifyToken(req.cookies.token)
    if (!token) {
        res.send("Expired login <button onclick='history.back()'>Go Back</button>")
        return
    }
    const user = await getOneData('users', {username: token.username})
    if (!user) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    if (user.username != "ehogin"){
        res.send("You are not authorized to view this page <button onclick='history.back()'>Go Back</button>")
    }
    const users = await getAllData('users')
    const usrlist = users.map(u => {
        return `<p><form action='/ban' method='post'>${u.dname} (<input type="text" value='${u.username}' name="username">) - ${u.status} <button type="submit">Ban</button></form></p>`
    })
    res.render('admin', {users: usrlist.join('')})
})
app.get('/admin/um', async (req, res) => {
    if (!req.cookies.token) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    const token = await verifyToken(req.cookies.token)
    if (!token) {
        res.send("Expired login <button onclick='history.back()'>Go Back</button>")
        return
    }
    const user = await getOneData('users', {username: token.username})
    if (!user) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    if (user.username != "ehogin"){
        res.send("You are not authorized to view this page <button onclick='history.back()'>Go Back</button>")
    }
    const users = await getAllData('users')
    const usrlist = users.map(u => {
        return `<p><form action='/admin/um' method='post'>${u.dname} (<input type="text" value='${u.username}' name="username">) - ${u.status} <button type="submit">un-Promote</button></form></p>`
    })
    res.render('admin', {users: usrlist.join('')})
})
app.post('/admin/notice', async (req, res) => {
    if (!req.cookies.token) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    const token = await verifyToken(req.cookies.token)
    if (!token) {
        res.send("Expired login <button onclick='history.back()'>Go Back</button>")
        return
    }
    const tuser = await getOneData('users', {username: token.username})
    if (!tuser) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    if (tuser.username != "ehogin"){
        res.send("You are not authorized to view this page <button onclick='history.back()'>Go Back</button>")
        return
    }
    await updateData('notices', {}, {title: req.body.title, content: req.body.content})
    res.redirect('/admin')
})
app.post('/admin', async (req, res) => {
    if (!req.cookies.token) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    const token = await verifyToken(req.cookies.token)
    if (!token) {
        res.send("Expired login <button onclick='history.back()'>Go Back</button>")
        return
    }
    const tuser = await getOneData('users', {username: token.username})
    if (!tuser) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    if (tuser.username != "ehogin"){
        res.send("You are not authorized to view this page <button onclick='history.back()'>Go Back</button>")
        return
    }
    const user = await getOneData('users', {username: req.body.username})
    if (!user) {
        res.send("User not found <button onclick='history.back()'>Go Back</button>")
        return
    }
    if (user.status == '<span class="red">[MOD]</span>') {
        res.send("User is already a moderator <button onclick='history.back()'>Go Back</button>")
        return
    }
    await updateData('users', {username: req.body.username}, {status: '<span class="red">[MOD]</span>'})
    res.redirect('/admin')
})
app.post('/admin/um', async (req, res) => {
    if (!req.cookies.token) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    const token = await verifyToken(req.cookies.token)
    if (!token) {
        res.send("Expired login <button onclick='history.back()'>Go Back</button>")
        return
    }
    const tuser = await getOneData('users', {username: token.username})
    if (!tuser) {
        res.send("You are not logged in <button onclick='history.back()'>Go Back</button>")
        return
    }
    if (tuser.username != "ehogin"){
        res.send("You are not authorized to view this page <button onclick='history.back()'>Go Back</button>")
        return
    }
    const user = await getOneData('users', {username: req.body.username})
    if (!user) {
        res.send("User not found <button onclick='history.back()'>Go Back</button>")
        return
    }
    if (user.status == '') {
        res.send("User is already sad <button onclick='history.back()'>Go Back</button>")
        return
    }
    await updateData('users', {username: req.body.username}, {status: ''})
    res.redirect('/admin')
})
app.engine('html', require('ejs').renderFile)
app.set('view engine', 'ejs')
app.set('views', __dirname)


app.listen(port, () => {
  console.log(`App listening on port ${port}`)
})//





















