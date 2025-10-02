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
const fs = require('fs')
app.use(cookieParser())

const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Images will be saved in 'uploads/' folder

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
const deebee = client.db('wchat')
deebee.createCollection('images')
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




app.use(express.json());
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
	        contacts += `<p class="contact" id="contact${c}">${c.charAt(0)}</p><br>`
	    })
    contacts+='<p class="contact" id="newc">+</p><br></br>'
	}
    for (let i = posts.length - 1; i >= 0; i--) {
        postAll += formatData(posts[i],i)+"<br>"
    }
    res.render('index', {posts: postAll, loggedin: user?true:false, usr: user?user.username:null,contacts})
})
app.get('/allposts', async (req, res) => {
    
    let postAll = ``
    const posts = await getAllData('posts')
    let notice = await getOneData('notices',{})
    postAll += `<div class="post">${notice.title}<br>${notice.content}</div><br>`
    
    for (let i = posts.length - 1; i >= 0; i--) {
        postAll += formatData(posts[i],i)+"<br>"
    }
    res.send(postAll)
})
app.get('/chatjoin', (req, res) => {
    res.render('chatjoin')
})
app.get('/signin', (req, res) => {
    res.render('signin')
})
app.post('/sendmessage', async (req, res) => {
    if(!req.cookies.token){
        res.send("no bad boi<button onclick='history.back()'>Go Back</button>")
        return
    }
    const user = await verifyToken(req.cookies.token)
    if(!user){
        res.send("no bad boi<button onclick='history.back()'>Go Back</button>")
        return
    }
    console.log(req.body)
    const contact = req.body.contact
    const chat = await getOneData('chats', {name: contact, users: {$in: [user.username]}})
    if(!chat){
        res.send("No chat found")
        return
    }
    let messages = chat.messages
    messages.push({author: user.username, message: req.body.message})
    await updateData('chats', {name: contact, users: {$in: [user.username]}}, {messages: chat.messages})
    res.send(messages.map(m => `<p><b>${m.author}:</b> ${m.message}</p>`).join(''))
})
app.post('/newchat', async (req, res) => {

    if(!req.cookies.token){
        res.send("Error: not logged in (wait,what?)")
        return
    }
    const user = await verifyToken(req.cookies.token)
    if(!user){
        res.send("Error: expired login")
        return
    }
    console.log("hey"+req.body)
    const contacts = req.body.contacts
    console.log(contacts)
    const cname = req.body.cname
    const chat = {name: cname, users: contacts, messages: []}
    addData('chats', chat)
    for (const u of chat.users){
        console.log("ln201"+u)
        const usr = await getOneData('users', {username:u})
        if (!usr){
            res.send("Error: user "+u+" not found")
            return
        }
        if (!usr.contacts) usr.contacts = []
        if (!usr.contacts.includes(cname)) usr.contacts.push(cname)
        await updateData('users', {username:usr.username}, {contacts: usr.contacts})
    }
    res.send("Yey")
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
    const author = await getOneData('users', {username: post.author.username})
    console.log(author)
    const data =  `
    <div id="bigpost" id="${id}">
        <h2>${post.title}</h2>
        <p>by <img src="/image:id=${author.pfpid? author.pfpid: 0}" alt="No PFP" width="30" height="30" style="border-radius:50%;">${author.dname} ${author.status}</p><br>
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
        if (!tuser.pfpid){
            tuser.pfpid = "0"
            await updateData("users", {username:tuser.username}, {pfp:tuser.pfp})
        }
        console.log(tuser.pfpid)
		const data =  `
	    <div id="bigpost">
	 <form action="/changedname" method="post">
	        <h2><input value='${user.dname}' id="dninp"type="text"name="dname"></h2>
		 
	            <input type="text" class="hidden" name="username" value='${user.username}'>
		 	<button type="submit">Change</button><br>
		 </form>
         <br>
         PFP<br>
         <form action="/upload" method="post" enctype="multipart/form-data">
                <input type="file" name="image" accept="image/*">
                <button type="submit">Upload</button>
            </form>
            <img src="/image:id=${tuser.pfpid}" alt="No PFP" width="100" height="100"><br>
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
    if (user.username != "ehogin" && user.username != "OllieVera"){
        res.send("You are not authorized to view this page <button onclick='history.back()'>Go Back</button>")
    }
    if (user.username == "ehogin"){
        const users = await getAllData('users')
        const usrlist = users.map(u => {
            return `<p><form action='/admin' method='post'>${u.dname} - ${u.email} (<input type="text" value='${u.username}' name="username">) - ${u.status} <button type="submit">Promote</button></form></p>`
        })
        res.render('admin', {users: usrlist.join('')})
        return
    }
    if (user.username == "OllieVera"){
        res.render('admin', {users: "lol u cant ban magnus"})
        return
    }
    res.send("oops i did smth wrong")
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
        return
    }
    const users = await getAllData('users')
    const usrlist = users.map(u => {
        return `<p><form action='/admin/um' method='post'>${u.dname} (<input type="text" value='${u.username}' name="username">) - ${u.status} <button type="submit">un-Promote</button></form></p>`
    })
    res.render('admin', {users: usrlist.join('')})
})
app.post('/addimg',async(req,res)=>{
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
    /** @type{Blob} */
    const img = req.body.img
    //img is blob
    const imgurl = URL.createObjectURL(img)
    await addData('images', {url: imgurl})
    const nimg = await getOneData('images', {url: imgurl})
    res.send(nimg._id)
})
app.get('/image:id=:id', async(req,res)=>{
    const id = req.params.id
    const img = await getOneData('images', {filename:id})
    
    if (!img){
        res.send(fs.readFileSync('uploads/default.png'))
        return
    }
    res.set('Content-Type', 'image/webp')
    res.send(img.data.buffer)
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
app.post('/messages', async (req, res) => {
     if(!req.cookies.token){
        res.send("no bad boi<button onclick='history.back()'>Go Back</button>")
        return
    }
    const user = await verifyToken(req.cookies.token)
    if(!user){
        res.send("no bad boi<button onclick='history.back()'>Go Back</button>")
        return
    }
    console.log(req.body)
    const contact = req.body.contact
    const chat = await getOneData('chats', {name: contact, users: {$in: [user.username]}})
    
    if(!chat){
        console.log(":(")
        res.send("No chat found")
        return
    }
    let messages = ''
    chat.messages.forEach(m => {
        messages += `<p><b>${m.author}:</b> ${m.message}</p>`
    })
    res.send(messages)
});
app.post('/upload', upload.single('image'), async (req, res) => {
    // req.file contains info about the uploaded file
    if(!req.cookies.token){
        res.send("no bad boi<button onclick='history.back()'>Go Back</button>")
        return
    }
    const user = await verifyToken(req.cookies.token)
    if(!user){
        res.send("no bad boi<button onclick='history.back()'>Go Back</button>")
        return
    }
    const usr = await getOneData('users', {username: user.username})
    if(!usr){
        res.send("no bad boi<button onclick='history.back()'>Go Back</button>")
        return
    }
    if (!usr.pfpid){
        usr.pfpid = "0"
    }

    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    console.log(req.file);
    await updateData('users', {username: usr.username}, {pfpid:req.file.filename})
    const file = fs.readFileSync(req.file.path)
    await addData('images', {data:file,filename:req.file.filename,mimetype:req.file.mimetype})
    res.redirect('/user:name='+usr.username)
    // add blob to database
    //await addData('images', {data: new Blob([req.file]), filename: req.file.filename, mimetype: req.file.mimetype})
    //res.send(`File uploaded: ${req.file.filename}. URL: /image:id=`);
});

app.engine('html', require('ejs').renderFile)
app.set('view engine', 'ejs')
app.set('views', __dirname)
app.use(express.static(__dirname+ '\\'))
app.listen(port, () => {
  console.log(`App listening on port ${port}`)
})