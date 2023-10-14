import express from 'express'
import nunjucks from 'nunjucks'
import cookieParser from 'cookie-parser'
import fs from 'fs'

const port = 4321;
import { join, dirname } from 'path'
import { Low, JSONFile } from 'lowdb'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url));

const file = join(__dirname, 'db', 'users.json')
const adapter = new JSONFile(file)
const userdb = new Low(adapter)


let users;
userdb.read().then(() => {
	users = userdb.data.users
})

let app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/static", express.static("static"));
app.use(cookieParser("randomkey"));

const db = JSON.parse(fs.readFileSync("./db/products.json"));

let categories = {};

db.products.forEach((product, index) => {
	product.id = index;
	if (categories[product.category] === undefined) {
		categories[product.category] = {
			brands: [],
		};
	}
	if (!categories[product.category].brands.includes(product.brand)) {
		categories[product.category].brands.push(product.brand);
	}
});

nunjucks.configure("views", {
	autoescape: true,
	express: app,
	noCache: true,
});

app.use((req, res, next) => {
	let loggedIn = false;
	if (req.signedCookies.credentials) {
		if (req.signedCookies.credentials.includes(":")) {
			let [email, pass] = req.signedCookies.credentials.split(":", 2);
			let user = users.find((u) => u.email == email && u.pass == pass);
			if (user) {
				loggedIn = true;
				req.user = user;
			}
		}
	}
	req.loggedIn = loggedIn;
	next();
});

app.get("/", (req, res) => {
	res.render("index.html", {
		carousal: [
			{
				img: "/static/images/banner-realmepadx.webp",
				link: "/search?q=realme Pad X",
			},
			{ img: "/static/images/banner-pixel6a.webp", link: "/product/21" },
		],
		sections: Object.keys(categories).map((cat) => {
			return {
				category: cat,
				products: db.products
					.filter((p) => p.category == cat)
					.slice(0, 1),
			};
		}),
		loggedIn: req.loggedIn,
	});
});

app.get("/login", (req, res) => {
	if (req.loggedIn) return res.redirect("/");
	res.render("login.html", { invalid: req.query.invalid ? true : false });
});

app.post("/login", (req, res) => {
	if (req.body.email.match(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/)) {
		if (!req.body.password.includes(":")) {
			if (
				users.find(
					(u) =>
						u.email == req.body.email && u.pass == req.body.password
				)
			) {
				return res
					.cookie(
						"credentials",
						`${req.body.email}:${req.body.password}`,
						{
							maxAge: 2592000 * 1000,
							signed: true,
						}
					)
					.redirect("/");
			}
		}
	}
	return res.redirect("/login?invalid=true");
});

app.get("/logout", (req, res) => {
	res.clearCookie("credentials");
	return res.redirect("/");
});

app.get("/signup", (req, res) => {
	if (req.loggedIn) return res.redirect("/");
	res.render("signup.html", { invalid: req.query.invalid ? true : false });
});

app.post("/signup", (req, res) => {
	if (req.body.email.match(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/)) {
		if (!req.body.password.includes(":")) {
			users.push({
				email: req.body.email,
				pass: req.body.password,
				cart: [],
				orders: []
			});
			userdb.write()
			return res
				.cookie(
					"credentials",
					`${req.body.email}:${req.body.password}`,
					{
						maxAge: 2592000 * 1000,
						signed: true,
					}
				)
				.redirect("/");
		}
	}
	return res.redirect("/signup?invalid=true");
});

app.get("/product/:pid", (req, res) => {
	let product = db.products[req.params.pid];
	if (product) {
		res.render("product.html", {
			product,
			loggedIn: req.loggedIn,
			inCart: (req.user ? req.user.cart.includes(parseInt(req.params.pid)) : false)
		});
	} else res.status(404).send("404 Not Found");
});

app.get("/search", (req, res) => {
	if (req.query.q) {
		let productset = new Set(db.products);
		req.query.q.split(" ").forEach((q) => {
			for (let p of productset) {
				if (
					!(
						p.name.toUpperCase().includes(q.toUpperCase()) ||
						p.brand.toUpperCase().includes(q.toUpperCase()) ||
						p.category.toUpperCase().includes(q.toUpperCase()) ||
						p.highlights.find((hi) =>
							hi.toUpperCase().includes(q.toUpperCase())
						)
					)
				) {
					productset.delete(p);
				}
			}
		});
		let products = Array.from(productset);
		switch (req.query.sort) {
			case "pricelth": {
				products.sort((a, b) => a.price - b.price);
				break;
			}
			case "pricehtl": {
				products.sort((a, b) => b.price - a.price);
				break;
			}
			case "nameatz": {
				products.sort((a, b) =>
					a.name === b.name ? 0 : a.name > b.name ? 1 : -1
				);
				break;
			}
			case "namezta": {
				products.sort((a, b) =>
					b.name === a.name ? 0 : b.name > a.name ? 1 : -1
				);
				break;
			}
		}
		res.status(200).render("search.html", {
			q: req.query.q,
			title: req.query.q,
			products: products,
			sorting: [
				{
					name: "Trending",
					val: "trending",
					selected: req.query.sort === "trending",
				},
				{
					name: "Price Low to High",
					val: "pricelth",
					selected: req.query.sort === "pricelth",
				},
				{
					name: "Price High to Low",
					val: "pricehtl",
					selected: req.query.sort === "pricehtl",
				},
				{
					name: "Name A to Z",
					val: "nameatz",
					selected: req.query.sort === "nameatz",
				},
				{
					name: "Name Z to A",
					val: "namezta",
					selected: req.query.sort === "namezta",
				},
			],
			loggedIn: req.loggedIn,
		});
	} else res.redirect("/");
});

app.get('/cart', (req, res)=> {
	if(!req.loggedIn) return res.redirect("/login")
	return res.render("cart.html", {
		loggedIn: req.loggedIn,
		products: req.user.cart.map(id => db.products[id])
	})
})

let formatter = new Intl.DateTimeFormat(undefined, {
	year: 'numeric', month: 'numeric', day: 'numeric',
	hour: 'numeric', minute: 'numeric', second: 'numeric',
	hour12: false
  })

app.get('/orders', (req, res) => {
	if(!req.loggedIn) return res.redirect("/login")
	let ordercopy = JSON.parse(JSON.stringify(req.user.orders));
	ordercopy.forEach((order, index) => {
		order.id = index + 1,
		order.products = order.products.map(p => db.products[p])
		order.time = formatter.format(new Date(order.date))
	})
	ordercopy.reverse()
	return res.render("orders.html", {
		loggedIn: req.loggedIn,
		orders: ordercopy
	})
})

app.get("/:category", (req, res) => {
	if (categories[req.params.category]) {
		let products = db.products.filter(
			(p) => p.category == req.params.category
		);
		switch (req.query.sort) {
			case "pricelth": {
				products.sort((a, b) => a.price - b.price);
				break;
			}
			case "pricehtl": {
				products.sort((a, b) => b.price - a.price);
				break;
			}
			case "nameatz": {
				products.sort((a, b) =>
					a.name === b.name ? 0 : a.name > b.name ? 1 : -1
				);
				break;
			}
			case "namezta": {
				products.sort((a, b) =>
					b.name === a.name ? 0 : b.name > a.name ? 1 : -1
				);
				break;
			}
		}
		res.status(200).render("products.html", {
			title: req.params.category,
			products: products,
			sorting: [
				{
					name: "Trending",
					val: "trending",
					selected: req.query.sort === "trending",
				},
				{
					name: "Price Low to High",
					val: "pricelth",
					selected: req.query.sort === "pricelth",
				},
				{
					name: "Price High to Low",
					val: "pricehtl",
					selected: req.query.sort === "pricehtl",
				},
				{
					name: "Name A to Z",
					val: "nameatz",
					selected: req.query.sort === "nameatz",
				},
				{
					name: "Name Z to A",
					val: "namezta",
					selected: req.query.sort === "namezta",
				},
			],
			loggedIn: req.loggedIn,
		});
	} else res.status(404).send("404 Not Found");
});


app.post("/addtocart", (req, res) => {
	if (!req.loggedIn) return res.send({loggedIn: false})
	if(db.products[parseInt(req.body.pid)]) {
		if(!req.user.cart.find(p => p.id == parseInt(req.body.pid))){
			req.user.cart.push(parseInt(req.body.pid))
			userdb.write()
		}
		return res.send({loggedIn:true})
	}
	return res.send({loggedIn:false})
})

app.post("/removefromcart", (req, res) => {
	console.log(req.body)
	if(db.products[parseInt(req.body.pid)]) {
		let p = req.user.cart.indexOf(p => p.id == parseInt(req.body.pid))
		if(p){
			req.user.cart.splice(p, 1)
			userdb.write()
		}
		return res.send({loggedIn:true})
	}
	return res.send({loggedIn:false})
})

app.post("/buy", (req, res) => {
	if(!req.loggedIn) return res.redirect("/login")
	if(req.user.cart.length === 0) return res.redirect("/cart")
	req.user.orders.push({
		date: Date.now(),
		products: [...req.user.cart]
	})
	req.user.cart = []
	userdb.write()
	res.redirect("/orders")
})

app.listen(port, () => {
	console.log(`Server is running on port: ${port}`);
});
