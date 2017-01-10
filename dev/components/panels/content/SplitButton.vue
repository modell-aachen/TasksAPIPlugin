<template>
    <div class="split-wrapper">
        <span v-on:click.self="callAction" class="button primary split">{{title}}
            <span data-dropdown="drop" v-on:click.stop="toggleSplitOpen">
                <i class="fa fa-chevron-down"></i>
            </span>
        </span><br>
        <ul v-show="splitOpen" class="f-dropdown">
        <slot>
            <li>This is a link</li>
            <li>This is another</li>
            <li>Yet another</li>
        </slot>
        </ul>
    </div>
</template>

<script>
export default {
    props: ['title'],
    data() {
        return {
            splitOpen: false
        };
    },
    methods: {
        toggleSplitOpen() {
            this.splitOpen = !this.splitOpen;
        },
        callAction () {
            this.$emit('action');
        }
    }
};
</script>

<style lang="sass">
#modacWrapper ul,
.foswikiTopic ul{
    list-style-image: none;
}
.split-wrapper {
    position: relative;
    display: inline-block;
}
ul.f-dropdown {
    position: absolute;
    text-align: left;
    box-shadow: 1px 1px 10px 1px rgba(0, 0, 0, 0.2);
    border-radius: 5px;
    list-style: none;
    background: white;
    border: #ccc;
    height: auto;
    width: 100%;
    max-width: 200px;
    z-index:100;
    margin: 1px 0px;
    padding: 0;
    width: auto;
    li {
        padding: 10px 14px;
        font-family: OpenSans-Semibold;
        font-size: 12px;
        color: #282C2E;
        cursor: pointer;
        &:hover {
            background-color: lightgray;
        }
    }
}
.split.button{
    margin-bottom: 1px;
    padding: 7px 42px 9px 10px;
    position: relative;
    span {
        border-left-color: rgba(255,255,255,0.5);
        border-left: solid 1px;
        display: block;
        height: 100%;
        position: absolute;
        width: 2rem;
        right: 0;
        top: 0;
        i {
            position: absolute;
            content: "";
            width: 0;
            height: 0;
            top: 23%;
            left: 27%;
        }
    }
}
</style>
