var express = require('express');
var router = express.Router();
var Op = require('sequelize').Op;
var Item = require('../model/Item');
var shopee = require('../helper/shopee');
var yahoo = require('../helper/yahoo');
var common = require('../helper/common');
var getAllItems = shopee.getAllItems;
var addItem = yahoo.addItem;
var productOnline = yahoo.productOnline;
var productOffline = yahoo.productOffline;
var getPayTypeAndShipType = yahoo.getPayTypeAndShipType;
var delItem = yahoo.delItem;
var config = require('../config');
// var key = {
//     shopeeshopid: config.shopee.shopid,
//     shopeepartnerid: config.shopee.partnerid,
//     shopeesecret: config.shopee.apisecret
// }

router.get("/sync", common.checkLogin(), function (req, res) {
    if (req.user.role == 2 || req.user.syncitems == 1) {
        res.render("item", {
            me: req.user
        });
    } else {
        res.redirect("/");
    }
});

router.get("/logs", common.checkLogin(1), function (req, res) {
    Item.findAll().then(function (items) {
        res.send(items);
    });
});

router.post("/fromshopee", common.checkLogin(1), function (req, res) {
    var shopeeKey = {
        shopeesecret: req.body.shopeesecret,
        shopeeshopid: req.body.shopeeshopid,
        shopeepartnerid: req.body.shopeepartnerid
    }
    var yahooStore = req.body.yahooapikey.slice(0, 5);
    Item.findAll({
        "where": {
            "on_yahoo": {
                [Op.eq]: 1
            },
            "yahoo_store": {
                [Op.eq]: yahooStore
            }
        },
        "attributes": ["shopee_id"]
    }).then(function (items) {
        var itemsMap = {};
        for (var i in items) {
            itemsMap[items[i].shopee_id.toString()] = true;
        }
        getAllItems(shopeeKey).then(function (categories) {
            var allItems = [];
            var allItemsId = [];
            var needUploadItems = [];
            var needDelItems;
            //避免撈出的商品中有重複
            for (var i in categories) {
                for (var j in categories[i].items) {
                    if (allItemsId.indexOf(categories[i].items[j].item_id) == -1) {
                        allItemsId.push(categories[i].items[j].item_id);
                        allItems.push(categories[i].items[j]);
                    }
                }
            }
            //避免上傳已上傳過的商品
            for (var k in allItems) {
                var itemId = allItems[k].item_id.toString();
                if (!itemsMap[itemId]) {
                    needUploadItems.push(allItems[k]);
                }
            }
            needDelItems = items;
            console.log("Total " + allItems.length + " shopee items");
            console.log("Total " + needUploadItems.length + " need to upload");
            console.log("Total " + needDelItems.length + " need to delete");
            res.send({
                "needUploadItems": needUploadItems,
                "needDelItems": needDelItems,
                "shopeeItemAmt": allItems.length
            });
        }).catch(function (err) {
            res.send({
                'err': err
            });
        });
    });
});

router.post("/upload/yahoo", common.checkLogin(1), function (req, res) {
    var yahooKey = {
        yahooapikey: req.body.yahooapikey,
        yahooapisecret: req.body.yahooapisecret
    }
    var shipType = req.body["shipType[]"];
    var payType = req.body["payType[]"];
    var yahooStore = req.body.yahooapikey.slice(0, 5);
    var orderData = JSON.parse(req.body.orderData);
    orderData["priceRate"] = req.body.priceRate;
    orderData["marketPriceRate"] = req.body.marketPriceRate;
    addItem(yahooKey, orderData, shipType, payType).then(function (result) {
        if (result["@Status"] == "Success" || result["Action"] == "uploadImage") {
            Item.create({
                "shopee_id": result.shopeeItemId,
                "on_yahoo": 1,
                "yahoo_id": (result.productId) ? result.productId : "fortest",
                "sku": result.sku,
                "product_name": result.productName,
                "yahoo_store": yahooStore
            });
        }
        res.send(result);
    }).catch(function (err) {
        res.send({
            "err": err
        });
    });
});

router.post("/online/yahoo", common.checkLogin(1), function (req, res) {
    var yahooKey = {
        yahooapikey: req.body.yahooapikey,
        yahooapisecret: req.body.yahooapisecret
    }
    var item = JSON.parse(req.body.item);
    productOnline(yahooKey, item).then(function (result) {
        res.send(result);
    }).catch(function (err) {
        res.send({
            "err": err
        });
    });
});

router.post("/offline/yahoo", common.checkLogin(1), function (req, res) {
    var yahooKey = {
        yahooapikey: req.body.yahooapikey,
        yahooapisecret: req.body.yahooapisecret
    }
    var yahooStore = req.body.yahooapikey.slice(0, 5);
    Item.findAll({
        "where": {
            "yahoo_store": {
                [Op.eq]: yahooStore
            }
        },
        "attributes": ["yahoo_id"]
    }).then(function (items) {
        if (items.length > 0) {
            items = items.map(function (ele) {
                return ele["yahoo_id"];
            });
            var offLineAll = Promise.all(items.map(function (ele) {
                return productOffline(yahooKey, {
                    productId: ele,
                    shopeeItemId: 'shopeeItemId'
                });
            }));
            offLineAll.then(function (result) {
                var delAll = Promise.all(items.map(function (ele) {
                    return delItem(yahooKey, {
                        productId: ele,
                        shopeeItemId: 'shopeeItemId'
                    });
                }));
                delAll.then(function (result) {
                    Item.destroy({
                        "where": {
                            "yahoo_store": {
                                [Op.eq]: yahooStore
                            }
                        }
                    });
                    res.send({
                        "amount": items.length
                    });
                }).catch(function (err) {
                    res.send({
                        "err": err
                    });
                });
            }).catch(function (err) {
                res.send({
                    "err": err
                });
            });
        } else {
            res.send({
                "amount": 0
            });
        }
    });
});


router.post("/yahoo/getPayTypeAndShipType", common.checkLogin(1), function (req, res) {
    var yahooKey = {
        yahooapikey: req.body.yahooapikey,
        yahooapisecret: req.body.yahooapisecret
    }
    getPayTypeAndShipType(yahooKey).then(function (result) {
        res.send(result);
    }).catch(function (err) {
        res.send({
            'err': err
        });
    });
});

module.exports = router;